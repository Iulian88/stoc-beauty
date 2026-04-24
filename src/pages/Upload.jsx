import { useState, useRef, useEffect } from 'react';
import { runClaudeOCR, runClaudeReceiptOCR, cleanupWorker, cleanProductName } from '../services/ocr';
import { storage } from '../services/storage';
import { PRODUCTS } from '../data/products';
import { useStock } from '../context/StockContext';
import { processEJImport } from '../services/ejImport';
import EJImportPreview from '../components/EJImportPreview';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const STEPS = ['Tip & Imagine', 'OCR', 'Verificare', 'Salvat'];

export default function Upload({ onNavigate }) {
  const { refresh } = useStock();
  const [step, setStep] = useState(0);
  const [docType, setDocType] = useState('intrare');

  // Ref set synchronously in the restore-check effect (which runs BEFORE the autosave
  // effect in the same flush). Prevents autosave from deleting the draft while the
  // restore banner is visible and the user hasn’t responded yet.
  const draftPendingRef = useRef(false);

  // Cleanup Tesseract worker when leaving the Upload page
  useEffect(() => () => { cleanupWorker(); }, []);

  // ── Intrare (OCR invoice) state ───────────────────────────────────────────
  const [sursa, setSursa] = useState('');
  const [facturaData, setFacturaData] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [ocrStatus, setOcrStatus] = useState('');
  const [rawText, setRawText] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [customProducts, setCustomProducts] = useState(() => storage.getCustomProducts());
  const [editModeItems, setEditModeItems] = useState(new Set());
  const fileRef = useRef();
  const cameraRef = useRef();

  // ── Iesire (vânzări raport casă) state ───────────────────────────────────
  const [salesItems, setSalesItems] = useState([]);     // [{ id, productId, productName, cantitate, cantitateInput }]
  const [salesSearch, setSalesSearch] = useState('');   // text filter for product dropdown
  const [salesProductId, setSalesProductId] = useState('');
  const [salesQty, setSalesQty] = useState(1);
  const [salesRef, setSalesRef] = useState('');         // optional reference
  const [salesSaved, setSalesSaved] = useState(false);  // success state for iesire
  const [draftRestorePrompt, setDraftRestorePrompt] = useState(false);

  // ── EJ import state ─────────────────────────────────────────────────────
  const [ejPreview, setEjPreview]   = useState(null);  // null | { recognized, unmatched, skipped }
  const [ejFileName, setEjFileName] = useState('');
  const [ejError, setEjError]       = useState('');
  const ejFileRef = useRef();

  const allProducts = [...PRODUCTS, ...customProducts];
  const isPLU = docType === 'iesire';
  const isEJ  = docType === 'ej';
  const isReceiptOCR = docType === 'ocr_raport';

  // ── Draft restore on mount ───────────────────────────────────────────────
  // NOTE: all state vars and derived consts (isPLU etc.) are declared above —
  // dep arrays are evaluated immediately so they must be in scope.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('sales_draft');
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft?.items?.length > 0) {
        draftPendingRef.current = true; // must be set before autosave effect runs
        setDraftRestorePrompt(true);
      }
    } catch { /* ignore corrupt draft */ }
  }, []);

  // ── Autosave draft on every change ──────────────────────────────────────
  useEffect(() => {
    if (salesSaved) return; // don't overwrite cleared draft after success
    if (draftPendingRef.current) return; // restore decision pending — don’t touch draft
    if (salesItems.length === 0 && !salesRef.trim()) {
      localStorage.removeItem('sales_draft');
      return;
    }
    try {
      localStorage.setItem('sales_draft', JSON.stringify({ items: salesItems, ref: salesRef }));
    } catch { /* storage full — silently skip */ }
  }, [salesItems, salesRef, salesSaved]);

  // ── beforeunload protection ──────────────────────────────────────────────
  useEffect(() => {
    if (!isPLU || salesItems.length === 0) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isPLU, salesItems.length]);

  const filteredProducts = allProducts.filter(p =>
    salesSearch === '' || p.name.toLowerCase().includes(salesSearch.toLowerCase())
  );

  function addSalesItem() {
    if (!salesProductId) return;
    const prod = allProducts.find(p => String(p.id) === String(salesProductId));
    if (!prod) return;
    const qty = Math.max(1, salesQty || 1);
    setSalesItems(prev => {
      const existing = prev.find(i => i.productId === prod.id);
      if (existing) {
        // Merge quantities
        return prev.map(i => {
          if (i.productId !== prod.id) return i;
          const newQty = i.cantitate + qty;
          return { ...i, cantitate: newQty, cantitateInput: String(newQty) };
        });
      }
      return [...prev, { id: Date.now(), productId: prod.id, productName: prod.name, cantitate: qty, cantitateInput: String(qty) }];
    });
    setSalesProductId('');
    setSalesSearch('');
    setSalesQty(1);
  }

  function removeSalesItem(id) {
    setSalesItems(prev => prev.filter(i => i.id !== id));
  }

  function updateSalesCantitate(id, val) {
    // Store raw string — no clamping, allows empty/partial input
    setSalesItems(prev => prev.map(i => i.id === id ? { ...i, cantitateInput: val } : i));
  }

  function normalizeSalesCantitate(id) {
    // Called onBlur: enforce minimum 1 and sync cantitate
    setSalesItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const num = Number(i.cantitateInput);
      const valid = num > 0 ? Math.round(num) : 1;
      return { ...i, cantitate: valid, cantitateInput: String(valid) };
    }));
  }

  function incrementSalesItem(id) {
    setSalesItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const newQty = i.cantitate + 1;
      return { ...i, cantitate: newQty, cantitateInput: String(newQty) };
    }));
  }

  function saveSalesTransaction() {
    if (salesItems.length === 0) return;
    try {
      storage.saveTransaction({
        tip: 'iesire',
        sursa: salesRef.trim() || 'raport casa',
        items: salesItems.map(i => ({
          productId: i.productId,
          productName: i.productName,
          cantitate: Math.max(1, Number(i.cantitateInput) || i.cantitate || 1),
        })),
      });
      localStorage.removeItem('sales_draft');
      refresh();
      setSalesSaved(true);
    } catch (err) {
      alert('❌ ' + err.message);
    }
  }

  function resetSales() {
    setSalesItems([]);
    setSalesSearch('');
    setSalesProductId('');
    setSalesQty(1);
    setSalesRef('');
    setSalesSaved(false);
    localStorage.removeItem('sales_draft');
  }

  function switchDocType(type) {
    if (salesItems.length > 0 && isPLU) {
      if (!window.confirm('Ai vânzări nesalvate. Dacă schimbi modul, lista se va pierde. Continui?')) return;
    }
    setDocType(type);
  }

  // ── Intrare handlers ──────────────────────────────────────────────────────
  function handleFile(file) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      alert('Fișierul este prea mare (max 20 MB). Alege o imagine mai mică.');
      return;
    }
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
  }

  async function startOCR() {
    if (!imageFile) return;
    setStep(1);
    setOcrStatus('Se pregătește imaginea...');

    const result = isReceiptOCR
      ? await runClaudeReceiptOCR(imageFile, setOcrStatus)
      : await runClaudeOCR(imageFile, setOcrStatus);
    if (!result.success) {
      setOcrStatus('❌ Eroare: ' + result.error);
      return;
    }

    if (result.factura) {
      setFacturaData(result.factura);
      if (!sursa) {
        const nr = result.factura.numar;
        const dt = result.factura.data;
        if (nr) setSursa(nr + (dt ? ` / ${dt}` : ''));
        else if (dt) setSursa(dt);
      }
    }

    const customProds = storage.getCustomProducts();
    const remapped = result.items.map(item => {
      if (item.suggestedProductId) return item;
      const match = customProds.find(cp =>
        item.rawName.toLowerCase().includes(cp.name.toLowerCase())
      );
      if (match) {
        return { ...item, suggestedProductId: match.id, suggestedProductName: match.name, needsReview: false };
      }
      return item;
    });

    const learnedAliases = storage.getLearnedAliases();
    const allProds = [...PRODUCTS, ...customProds];
    const remapped2 = remapped.map(item => {
      if (item.suggestedProductId && !item.needsReview) return item;
      const normInput = cleanProductName(item.rawName).toLowerCase();
      for (const [prodIdStr, aliases] of Object.entries(learnedAliases)) {
        const hit = aliases.find(a => normInput.includes(a) || a.includes(normInput));
        if (hit) {
          const prod = allProds.find(p => p.id === Number(prodIdStr));
          if (prod) {
            console.log('[LEARNED ALIAS MATCH]', { ocr: item.rawName, matched: prod.name, alias: hit });
            return { ...item, suggestedProductId: prod.id, suggestedProductName: prod.name, needsReview: false };
          }
        }
      }
      return item;
    });
    setParsedItems(remapped2.map((item, idx) => ({
      ...item,
      _idx: idx,
      _productId: item.suggestedProductId,
      _productName: item.suggestedProductName,
      _confirmed: !item.needsReview,
      _newName: item.needsReview ? item.rawName : undefined,
    })));
    setStep(2);
  }

  function updateItem(idx, field, value) {
    setParsedItems(prev => prev.map(item =>
      item._idx === idx ? { ...item, [field]: value, _confirmed: true } : item
    ));
  }

  function assignProduct(idx, productId) {
    const id = parseInt(productId);
    const prod = [...PRODUCTS, ...storage.getCustomProducts()].find(p => p.id === id);
    if (!prod) return;
    setParsedItems(prev => prev.map(item =>
      item._idx === idx ? {
        ...item,
        _productId: prod.id,
        _productName: prod.name,
        needsReview: false,
        _confirmed: true,
      } : item
    ));
    setEditModeItems(prev => { const next = new Set(prev); next.delete(idx); return next; });
  }

  function removeItem(idx) {
    setParsedItems(prev => prev.filter(item => item._idx !== idx));
  }

  function acceptMatch(idx) {
    setParsedItems(prev => prev.map(item =>
      item._idx === idx ? { ...item, _confirmed: true, needsReview: false } : item
    ));
  }

  function acceptAndLearn(idx) {
    const item = parsedItems.find(i => i._idx === idx);
    if (!item || !item._productId) return;
    const nameToLearn = cleanProductName(item.rawName);
    storage.addAliasToProduct(item._productId, nameToLearn);
    console.log('[LEARN]', { product: item._productName, alias: nameToLearn });
    setParsedItems(prev => prev.map(i =>
      i._idx === idx ? { ...i, _confirmed: true, needsReview: false } : i
    ));
  }

  function toggleEditMode(idx) {
    setEditModeItems(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function openCreateNew(idx) {
    setParsedItems(prev => prev.map(item =>
      item._idx === idx
        ? { ...item, _creatingNew: true, _newName: item._newName || item.rawName || '' }
        : item
    ));
  }

  function closeCreateNew(idx) {
    setParsedItems(prev => prev.map(item =>
      item._idx === idx ? { ...item, _creatingNew: false } : item
    ));
  }

  function addManualItem() {
    const newIdx = Date.now();
    setParsedItems(prev => [...prev, {
      _idx: newIdx,
      lineNumber: null,
      rawName: '(adăugat manual)',
      quantity: 1,
      suggestedProductId: null,
      suggestedProductName: null,
      _productId: null,
      _productName: null,
      needsReview: true,
      _confirmed: false,
      _newName: '',
      _creatingNew: false,
    }]);
  }

  function updateNewProductField(idx, field, value) {
    setParsedItems(prev => prev.map(item =>
      item._idx === idx ? { ...item, [field]: value } : item
    ));
  }

  function confirmNewProduct(idx) {
    const item = parsedItems.find(i => i._idx === idx);
    const name = (item._newName || '').trim();
    if (name.length < 3) return;

    const pretVanzare = Number(item._newPretVanzare) > 0 ? Number(item._newPretVanzare) : undefined;
    const newProd = storage.saveCustomProduct({ name, pretVanzare });
    setCustomProducts(storage.getCustomProducts());

    setParsedItems(prev => prev.map(i =>
      i._idx === idx ? {
        ...i,
        _productId: newProd.id,
        _productName: newProd.name,
        needsReview: false,
        _confirmed: true,
        _creatingNew: false,
      } : i
    ));
  }

  function saveTransaction() {
    const validItems = parsedItems.filter(item => item._productId && item._confirmed);
    if (validItems.length === 0) return;

    storage.saveTransaction({
      tip: docType === 'ocr_raport' ? 'iesire' : docType,
      sursa: sursa || (docType === 'ocr_raport' ? 'ocr raport casa' : 'Factură'),
      factura: docType === 'ocr_raport' ? undefined : (facturaData ?? undefined),
      items: validItems.map(item => ({
        productId: item._productId,
        productName: item._productName,
        cantitate: Number(item.quantity),
      })),
      rawOCR: rawText.replace(/[<>]/g, ''),
    });
    refresh();
    setStep(3);
  }

  function reset() {
    setStep(0);
    setSursa('');
    setFacturaData(null);
    setImageFile(null);
    setImageUrl(null);
    setOcrStatus('');
    setRawText('');
    setParsedItems([]);
  }

  const confirmedCount = parsedItems.filter(i => i._confirmed && i._productId).length;
  const needsReviewCount = parsedItems.filter(i => (i.needsReview || !i._productId) && !i._confirmed).length;

  const sortedItems = [...parsedItems].sort((a, b) => {
    if (a.lineNumber != null && b.lineNumber != null) return a.lineNumber - b.lineNumber;
    if (a.lineNumber != null) return -1;
    if (b.lineNumber != null) return 1;
    return 0;
  });

  // ── EJ file handler ──────────────────────────────────────────────────────
  function handleEJFile(file) {
    if (!file) return;
    setEjError('');
    setEjPreview(null);
    setEjFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const result = processEJImport(data);
        setEjPreview(result);
      } catch (err) {
        setEjError('Eroare la citire: ' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Import vânzări (EJ) — safe preview, no data is written
  // ══════════════════════════════════════════════════════════════════════════
  if (isEJ) {
    return (
      <div>
        <p className="page-title">Import vânzări (EJ)</p>

        {/* Doc type toggle */}
        <div className="form-group">
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)' }}
              onClick={() => setDocType('intrare')}
            >
              <div>📥 Factură</div>
              <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↑ intrare stoc</div>
            </button>
            <button
              className="btn"
              style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)' }}
              onClick={() => setDocType('iesire')}
            >
              <div>🛒 Vânzări</div>
              <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↓ raport casă</div>
            </button>
            <button
              className="btn"
              style={{ flex: 1, background: 'rgba(99,102,241,0.12)', border: '1px solid #6366f1', color: '#6366f1' }}
            >
              <div>📊 Import EJ</div>
              <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↑↓ istoric casă</div>
            </button>
            <button
              className="btn"
              style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)' }}
              onClick={() => setDocType('ocr_raport')}
            >
              <div>📷 OCR Casă</div>
              <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↓ vânzări poză</div>
            </button>
          </div>
        </div>

        {/* File upload zone (hidden when preview is shown) */}
        {!ejPreview && (
          <div className="card" style={{ textAlign: 'center', padding: '28px 20px', marginBottom: 12 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📂</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text1)', marginBottom: 6 }}>
              Selectează fișierul JSON
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
              Fișierul <code>vanzari_structurat.json</code> generat din jurnalul EJ.<br />
              Nicio dată nu va fi salvată automat.
            </div>
            <button
              className="btn btn-primary"
              style={{ background: '#6366f1', borderColor: '#6366f1' }}
              onClick={() => ejFileRef.current?.click()}
            >
              📂 Alege fișier .json
            </button>
            <input
              ref={ejFileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={e => { handleEJFile(e.target.files[0]); e.target.value = ''; }}
            />
          </div>
        )}

        {ejError && (
          <div className="alert alert-warning" style={{ marginBottom: 12 }}>
            ❌ {ejError}
          </div>
        )}

        {ejPreview && (
          <EJImportPreview
            preview={ejPreview}
            fileName={ejFileName}
            onReset={() => { setEjPreview(null); setEjFileName(''); setEjError(''); }}
          />
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: "Introdu vânzări" (iesire) — completely separate from OCR flow
  // ══════════════════════════════════════════════════════════════════════════
  if (isPLU) {
    if (salesSaved) {
      return (
        <div>
          <p className="page-title">Introdu vânzări</p>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, marginBottom: 8 }}>Salvat cu succes!</div>
            <div style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 32 }}>
              {salesItems.length} produs{salesItems.length !== 1 ? 'e' : ''} au fost{' '}
              <strong style={{ color: '#dc2626' }}>scăzute din stoc</strong> (vânzări raport casă).
            </div>
            <button className="btn btn-primary" onClick={() => { resetSales(); setDocType('iesire'); }} style={{ marginBottom: 10, background: '#dc2626', borderColor: '#dc2626' }}>
              📤 Adaugă alt raport
            </button>
            <button className="btn btn-secondary" onClick={() => onNavigate('stock')}>
              📦 Vezi stocul
            </button>
          </div>
        </div>
      );
    }

    return (
      <div>
        <p className="page-title">Introdu vânzări</p>

        {/* Draft restore dialog */}
        {draftRestorePrompt && (
          <div style={{ background: '#fef9c3', border: '1px solid #ca8a04', borderRadius: 10, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, fontSize: 13, color: '#92400e' }}>
              💾 Am găsit un draft nesalvat. Vrei să restaurezi lista anterioară?
            </span>
            <button
              className="btn btn-primary"
              style={{ background: '#ca8a04', borderColor: '#ca8a04', padding: '6px 14px', fontSize: 12 }}
              onClick={() => {
                draftPendingRef.current = false;
                try {
                  const draft = JSON.parse(localStorage.getItem('sales_draft') || '{}');
                  if (draft.items) setSalesItems(draft.items);
                  if (draft.ref) setSalesRef(draft.ref);
                } catch { /* ignore */ }
                setDraftRestorePrompt(false);
              }}
            >
              Da, restaurează
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 14px', fontSize: 12 }}
              onClick={() => {
                draftPendingRef.current = false;
                localStorage.removeItem('sales_draft');
                setDraftRestorePrompt(false);
              }}
            >
              Nu, șterge
            </button>
          </div>
        )}

        {/* Doc type toggle */}
        <div className="form-group">
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              style={{
                flex: 1,
                background: 'var(--bg3)',
                border: '1px solid var(--border2)',
                color: 'var(--text2)',
              }}
              onClick={() => switchDocType('intrare')}
            >
              <div>📥 Factură</div>
              <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↑ intrare stoc</div>
            </button>
            <button
              className="btn"
              style={{
                flex: 1,
                background: 'rgba(224,92,92,0.15)',
                border: '1px solid var(--red)',
                color: 'var(--red)',
              }}
            >
              <div>🛒 Vânzări</div>
              <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↓ raport casă</div>
            </button>
            <button
              className="btn"
              style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)' }}
              onClick={() => switchDocType('ej')}
            >
              <div>📊 Import EJ</div>
              <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↑↓ istoric casă</div>
            </button>
          </div>
        </div>

        {/* Reference */}
        <div className="form-group">
          <label className="label">Referință raport (opțional)</label>
          <input
            className="input"
            placeholder="ex: Raport casă ian 2026"
            value={salesRef}
            onChange={e => setSalesRef(e.target.value)}
          />
        </div>

        {/* Product picker */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: 'var(--text1)' }}>Adaugă produs</div>

          <div className="form-group" style={{ marginBottom: 8 }}>
            <input
              className="input"
              placeholder="🔍 Caută produs..."
              value={salesSearch}
              onChange={e => { setSalesSearch(e.target.value); setSalesProductId(''); }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 8 }}>
            <select
              className="input"
              value={salesProductId}
              onChange={e => setSalesProductId(e.target.value)}
            >
              <option value="">— Selectează produs —</option>
              {filteredProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.isCustom ? ' ★' : ''}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '4px 8px' }}>
              <button
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text2)', lineHeight: 1, padding: '0 2px' }}
                onClick={() => setSalesQty(q => Math.max(1, q - 1))}
              >−</button>
              <input
                className="input"
                type="number"
                min="1"
                value={salesQty}
                onChange={e => setSalesQty(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: 52, textAlign: 'center', border: 'none', background: 'transparent', padding: '6px 0' }}
              />
              <button
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text2)', lineHeight: 1, padding: '0 2px' }}
                onClick={() => setSalesQty(q => q + 1)}
              >+</button>
            </div>
            <button
              className="btn btn-primary"
              style={{ flex: 1, background: '#dc2626', borderColor: '#dc2626' }}
              disabled={!salesProductId}
              onClick={addSalesItem}
            >
              + Adaugă
            </button>
          </div>
        </div>

        {/* Items list */}
        {salesItems.length > 0 ? (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text1)' }}>
                Lista vânzări
              </div>
              <span className="badge badge-red">{salesItems.length} produs{salesItems.length !== 1 ? 'e' : ''}</span>
            </div>
            {salesItems.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border1)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.productName}
                  </div>
                </div>
                {/* Quick +1 */}
                <button
                  onClick={() => incrementSalesItem(item.id)}
                  style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 6, color: '#dc2626', fontWeight: 700, fontSize: 15, width: 30, height: 30, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  +1
                </button>
                {/* Qty input */}
                <input
                  className="input"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="1"
                  value={item.cantitateInput ?? ''}
                  onChange={e => updateSalesCantitate(item.id, e.target.value)}
                  onBlur={() => normalizeSalesCantitate(item.id)}
                  style={{ width: 58, textAlign: 'center', flexShrink: 0 }}
                />
                {/* Remove */}
                <button
                  onClick={() => removeSalesItem(item.id)}
                  style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#dc2626', flexShrink: 0, padding: '0 2px' }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ marginBottom: 12 }}>
            <div className="empty-state-icon">🛒</div>
            <div className="empty-state-text">Nicio vânzare adăugată.<br/>Selectează un produs și apasă + Adaugă.</div>
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ background: '#dc2626', borderColor: '#dc2626' }}
          disabled={salesItems.length === 0}
          onClick={saveSalesTransaction}
        >
          📤 Salvează vânzări ({salesItems.reduce((s, i) => s + i.cantitate, 0)} buc, {salesItems.length} produse)
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: "Adaugă factură" (intrare) — OCR flow, unchanged
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div>
      <p className="page-title">{isReceiptOCR ? 'OCR Raport Casă' : 'Adaugă factură — intrare stoc'}</p>

      {/* Step indicator */}
      <div className="steps" style={{ marginBottom: 24 }}>
        {STEPS.map((label, i) => (
          <div
            key={i}
            className={`step ${i === step ? 'active' : i < step ? 'done' : ''}`}
            data-num={i + 1}
          >
            {label}
          </div>
        ))}
      </div>

      {/* STEP 0: Type + Image */}
      {step === 0 && (
        <>
          <div className="form-group">
            <label className="label">Tip document</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: 'rgba(76,175,125,0.15)',
                  border: '1px solid var(--green)',
                  color: 'var(--green)',
                }}
              >
                <div>📥 Factură</div>
                <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↑ crește stocul</div>
              </button>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: 'var(--bg3)',
                  border: '1px solid var(--border2)',
                  color: 'var(--text2)',
                }}
                onClick={() => setDocType('iesire')}
              >
                <div>🛒 Vânzări</div>
                <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↓ raport casă</div>
              </button>
              <button
                className="btn"
                style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)' }}
                onClick={() => setDocType('ej')}
              >
                <div>📊 Import EJ</div>
                <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↑↓ istoric casă</div>
              </button>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: isReceiptOCR ? 'rgba(220,38,38,0.12)' : 'var(--bg3)',
                  border: isReceiptOCR ? '1px solid #dc2626' : '1px solid var(--border2)',
                  color: isReceiptOCR ? '#dc2626' : 'var(--text2)',
                }}
                onClick={() => setDocType('ocr_raport')}
              >
                <div>📷 OCR Casă</div>
                <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↓ vânzări poză</div>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="label">{isReceiptOCR ? 'Referință (opțional)' : 'Referință factură (opțional)'}</label>
            <input
              className="input"
              placeholder={isReceiptOCR ? 'ex: 04/04/2026' : 'ex: Factură #123 / Furnizor X'}
              value={sursa}
              onChange={e => setSursa(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="label">{isReceiptOCR ? 'Imagine raport casă' : 'Imagine factură'}</label>
            <div
              className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
            >
              {imageUrl ? (
                <img src={imageUrl} alt="preview" className="img-preview" />
              ) : (
                <>
                  <div className="upload-icon">📷</div>
                  <div className="upload-text">Foloseşte butoanele de mai jos</div>
                  <div className="upload-hint">Sau trage imaginea direct aici</div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => cameraRef.current?.click()}
              >
                📷 Fă poză
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => fileRef.current?.click()}
              >
                🖼 Alege din galerie
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, textAlign: 'center' }}>
              Poți face o poză sau selecta una din galerie
            </div>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }}
            />
          </div>

          {imageFile && (
            <button className="btn btn-primary" onClick={startOCR}>
              🔍 Extrage text (OCR)
            </button>
          )}

          <div style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={addManualItem}>
              ✏️ Introducere manuală (fără OCR)
            </button>
          </div>

          {parsedItems.length > 0 && (
            <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setStep(2)}>
              → Continuă la verificare
            </button>
          )}
        </>
      )}

      {/* STEP 1: OCR running */}
      {step === 1 && (
        <div className="loading">
          <div className="spinner" />
          <div>{ocrStatus}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 260, textAlign: 'center' }}>
            Claude analizează imaginea — poate dura câteva secunde
          </div>
        </div>
      )}

      {/* STEP 2: Review */}
      {step === 2 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <span className="badge badge-green" style={{ marginRight: 6 }}>✓ {confirmedCount} OK</span>
              {needsReviewCount > 0 && <span className="badge badge-yellow">⚠ {needsReviewCount} necesită verificare</span>}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={addManualItem}>+ Adaugă</button>
          </div>

          {needsReviewCount > 0 && (
            <div className="alert alert-warning">
              ⚠️ Unele produse nu au fost recunoscute automat. Completează datele pentru fiecare produs nou sau asociază-le la un produs existent.
            </div>
          )}

          {sortedItems.map(item => {
            const isNewProduct = item.needsReview && !item._productId;
            const canConfirm = (item._newName || '').trim().length >= 3;

            if (isNewProduct) {
              return (
                <div key={item._idx} style={{ border: '2px solid #f59e0b', borderRadius: 10, padding: 14, marginBottom: 10, background: 'rgba(245,158,11,0.06)' }}>
                  <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 4, fontSize: 15 }}>
                    ⚠️ ATENȚIE — PRODUS NOU DETECTAT!
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                    Text detectat din factură: <em>„{item.rawName}"</em>
                  </div>

                  <div className="form-group">
                    <label className="label">Denumire produs (va fi salvat în catalog)</label>
                    <input
                      className="input"
                      placeholder="ex: Mașină tuns Wella Pro..."
                      value={item._newName || ''}
                      onChange={e => updateNewProductField(item._idx, '_newName', e.target.value)}
                    />
                    {(item._newName || '').trim().length > 0 && (item._newName || '').trim().length < 3 && (
                      <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 3 }}>Minim 3 caractere</div>
                    )}
                    {(() => {
                      const trimmed = (item._newName || '').trim().toLowerCase();
                      return trimmed.length >= 3 && allProducts.some(p => p.name.toLowerCase() === trimmed)
                        ? <div style={{ fontSize: 11, color: '#b45309', marginTop: 3 }}>⚠ Există deja un produs cu acest nume</div>
                        : null;
                    })()}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <div className="form-group" style={{ width: 80 }}>
                      <label className="label">Cantitate</label>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateItem(item._idx, 'quantity', parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="label">Preț vânzare RON (opț.)</label>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="ex: 45.00"
                        value={item._newPretVanzare || ''}
                        onChange={e => updateNewProductField(item._idx, '_newPretVanzare', e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      disabled={!canConfirm}
                      onClick={() => confirmNewProduct(item._idx)}
                    >
                      ✅ Adaugă în catalog &amp; include în tranzacție
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => removeItem(item._idx)}>
                      ❌ Ignoră
                    </button>
                  </div>

                  <details style={{ marginTop: 10 }}>
                    <summary style={{ fontSize: 12, color: 'var(--text3)', cursor: 'pointer' }}>
                      🔄 Sau asociază la un produs existent
                    </summary>
                    <select
                      className="input"
                      style={{ marginTop: 6 }}
                      value=""
                      onChange={e => assignProduct(item._idx, e.target.value)}
                    >
                      <option value="">— Selectează produs —</option>
                      {allProducts.map(p => (
                        <option key={p.id} value={p.id}>{p.name}{p.isCustom ? ' ★' : ''}</option>
                      ))}
                    </select>
                  </details>
                </div>
              );
            }

            return (
              <div key={item._idx} className={`review-item ${item._confirmed ? 'confirmed' : ''}`}>
                {item.lineNumber != null && (
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                    Linie factură: #{item.lineNumber}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div>
                    <div className="review-raw" style={{ margin: 0 }}>OCR: {item.rawName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                      Sugestie: <strong>{item.suggestedProductName || '—'}</strong>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11,
                    padding: '2px 7px',
                    borderRadius: 10,
                    background: !item._productId ? '#fee2e2' : item.needsReview && !item._confirmed ? '#fef3c7' : '#dcfce7',
                    color: !item._productId ? '#b91c1c' : item.needsReview && !item._confirmed ? '#92400e' : '#166534',
                    whiteSpace: 'nowrap',
                    marginLeft: 8,
                    flexShrink: 0,
                  }}>
                    {!item._productId ? '⚪ Neselectat' : item.needsReview && !item._confirmed ? '🟡 Ambiguu' : '🟢 Confirmat'}
                  </span>
                </div>

                {item.needsReview && item._productId && !item._confirmed && !editModeItems.has(item._idx) ? (
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: '#92400e', marginBottom: 6, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, padding: '6px 10px' }}>
                      ⚠ Match ambiguu — confirmă sau editează manual
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-sm"
                        style={{ flex: 1, background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: 6, fontSize: 12, padding: '6px 4px' }}
                        onClick={() => acceptMatch(item._idx)}
                      >
                        ✓ Confirmă
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ flex: 1.6, background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: 6, fontSize: 12, padding: '6px 4px' }}
                        onClick={() => acceptAndLearn(item._idx)}
                      >
                        ✓ Confirmă + Învață
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: 6, fontSize: 12, padding: '6px 8px' }}
                        onClick={() => toggleEditMode(item._idx)}
                      >
                        ✏ Editare
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="form-group">
                    {editModeItems.has(item._idx) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <label className="label" style={{ margin: 0 }}>Alege produsul</label>
                        <button
                          style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text3)', cursor: 'pointer', padding: 0 }}
                          onClick={() => toggleEditMode(item._idx)}
                        >
                          ← Înapoi
                        </button>
                      </div>
                    )}
                    {!editModeItems.has(item._idx) && <label className="label">Produs</label>}
                    <select
                      className="input"
                      value={item._productId || ''}
                      onChange={e => assignProduct(item._idx, e.target.value)}
                    >
                      <option value="">— Selectează produs —</option>
                      {allProducts.map(p => (
                        <option key={p.id} value={p.id}>{p.name}{p.isCustom ? ' ★' : ''}</option>
                      ))}
                    </select>

                    {!item._creatingNew && (
                      <button
                        className="btn btn-sm"
                        style={{ marginTop: 6, width: '100%', background: 'rgba(99,102,241,0.1)', border: '1px solid #6366f1', color: '#6366f1', borderRadius: 6, fontSize: 12, padding: '6px 0' }}
                        onClick={() => openCreateNew(item._idx)}
                      >
                        ➕ Adaugă produs nou în catalog
                      </button>
                    )}

                    {item._creatingNew && (
                      <div style={{ marginTop: 8, padding: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid #6366f1', borderRadius: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: '#6366f1', marginBottom: 8 }}>Produs nou</div>
                        <div className="form-group" style={{ marginBottom: 8 }}>
                          <label className="label">Denumire</label>
                          <input
                            className="input"
                            placeholder="min. 3 caractere"
                            value={item._newName || ''}
                            onChange={e => updateNewProductField(item._idx, '_newName', e.target.value)}
                            autoFocus
                          />
                          {(item._newName || '').trim().length > 0 && (item._newName || '').trim().length < 3 && (
                            <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 3 }}>Minim 3 caractere</div>
                          )}
                          {(() => {
                            const trimmed = (item._newName || '').trim().toLowerCase();
                            return trimmed.length >= 3 && allProducts.some(p => p.name.toLowerCase() === trimmed)
                              ? <div style={{ fontSize: 11, color: '#b45309', marginTop: 3 }}>⚠ Există deja un produs cu acest nume</div>
                              : null;
                          })()}
                        </div>
                        <div className="form-group" style={{ marginBottom: 8 }}>
                          <label className="label">Preț vânzare RON (opțional)</label>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="ex: 45.00"
                            value={item._newPretVanzare || ''}
                            onChange={e => updateNewProductField(item._idx, '_newPretVanzare', e.target.value)}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1 }}
                            disabled={(item._newName || '').trim().length < 3}
                            onClick={() => confirmNewProduct(item._idx)}
                          >
                            ✅ Creează &amp; adaugă
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => closeCreateNew(item._idx)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="review-controls">
                  <div style={{ flex: 1 }}>
                    <label className="label">Cantitate</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => updateItem(item._idx, 'quantity', parseInt(e.target.value) || 1)}
                      style={{ width: 80 }}
                    />
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => removeItem(item._idx)}>🗑</button>
                </div>
              </div>
            );
          })}

          {parsedItems.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-text">Nicio linie detectată.<br/>Adaugă manual produsele.</div>
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={saveTransaction}
            disabled={confirmedCount === 0}
          >
            💾 Salvează intrare stoc ({confirmedCount} produse)
          </button>

          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setStep(0)}>
            ← Înapoi
          </button>

          {rawText && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 12, color: 'var(--text3)', cursor: 'pointer' }}>Text brut OCR</summary>
              <pre style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, whiteSpace: 'pre-wrap', background: 'var(--bg3)', padding: 10, borderRadius: 8, lineHeight: 1.5 }}>
                {rawText}
              </pre>
            </details>
          )}
        </>
      )}

      {/* STEP 3: Success */}
      {step === 3 && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, marginBottom: 8 }}>Salvat cu succes!</div>
          <div style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 32 }}>
            {confirmedCount} produse au fost{' '}
            {isReceiptOCR
              ? <strong style={{ color: '#dc2626' }}>scăzute din stoc</strong>
              : <strong style={{ color: 'var(--green)' }}>adăugate în stoc</strong>
            }
            {isReceiptOCR ? ' (casă)' : ' (factură)'}.
          </div>
          <button className="btn btn-primary" onClick={reset} style={{ marginBottom: 10 }}>
            {isReceiptOCR ? '📷 OCR alt raport' : '📥 Adaugă altă factură'}
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('stock')}>
            📦 Vezi stocul
          </button>
        </div>
      )}
    </div>
  );
}
