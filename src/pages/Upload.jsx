import { useState, useRef, useEffect } from 'react';
import { runClaudeOCR, cleanupWorker } from '../services/ocr';
import { storage } from '../services/storage';
import { PRODUCTS } from '../data/products';
import { useStock } from '../context/StockContext';
import { MAX_FILE_SIZE_BYTES } from '../constants';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB — compresia se face înainte de OCR

const STEPS = ['Tip & Imagine', 'OCR', 'Verificare', 'Salvat'];

export default function Upload({ onNavigate }) {
  const { refresh } = useStock();
  const [step, setStep] = useState(0);
  const [docType, setDocType] = useState('intrare');

  // Cleanup Tesseract worker when leaving the Upload page
  useEffect(() => () => { cleanupWorker(); }, []);
  const [sursa, setSursa] = useState('');
  const [facturaData, setFacturaData] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [ocrStatus, setOcrStatus] = useState('');
  const [rawText, setRawText] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [customProducts, setCustomProducts] = useState(() => storage.getCustomProducts());
  const fileRef = useRef();
  const cameraRef = useRef();

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

    const result = await runClaudeOCR(imageFile, setOcrStatus);
    if (!result.success) {
      setOcrStatus('❌ Eroare: ' + result.error);
      return;
    }

    // Auto-fill sursa from invoice metadata if field is empty
    if (result.factura) {
      setFacturaData(result.factura);
      if (!sursa) {
        const nr = result.factura.numar;
        const dt = result.factura.data;
        if (nr) setSursa(nr + (dt ? ` / ${dt}` : ''));
        else if (dt) setSursa(dt);
      }
    }

    // Al doilea pass: potrivire cu produse custom salvate
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
    setParsedItems(remapped.map((item, idx) => ({
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
  }

  function removeItem(idx) {
    setParsedItems(prev => prev.filter(item => item._idx !== idx));
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
    if (!name) return;

    const newProd = storage.saveCustomProduct({ name });
    setCustomProducts(storage.getCustomProducts());

    setParsedItems(prev => prev.map(i =>
      i._idx === idx ? {
        ...i,
        _productId: newProd.id,
        _productName: newProd.name,
        needsReview: false,
        _confirmed: true,
      } : i
    ));
  }

  function saveTransaction() {
    const validItems = parsedItems.filter(item => item._productId && item._confirmed);
    if (validItems.length === 0) return;

    storage.saveTransaction({
      tip: docType,
      sursa: sursa || (docType === 'intrare' ? 'Factură' : 'Raport PLU'),
      factura: facturaData ?? undefined,
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
    setDocType('intrare');
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
  const allProducts = [...PRODUCTS, ...customProducts];
  const isPLU = docType === 'iesire';

  // T2: sort by lineNumber ascending, nulls last
  const sortedItems = [...parsedItems].sort((a, b) => {
    if (a.lineNumber != null && b.lineNumber != null) return a.lineNumber - b.lineNumber;
    if (a.lineNumber != null) return -1;
    if (b.lineNumber != null) return 1;
    return 0;
  });

  return (
    <div>
      <p className="page-title">{isPLU ? 'Raport PLU — scădere stoc' : 'Adaugă factură — intrare stoc'}</p>

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
                  background: docType === 'intrare' ? 'rgba(76,175,125,0.15)' : 'var(--bg3)',
                  border: `1px solid ${docType === 'intrare' ? 'var(--green)' : 'var(--border2)'}`,
                  color: docType === 'intrare' ? 'var(--green)' : 'var(--text2)',
                }}
                onClick={() => setDocType('intrare')}
              >
                <div>📥 Factură</div>
                <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↑ crește stocul</div>
              </button>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: docType === 'iesire' ? 'rgba(224,92,92,0.15)' : 'var(--bg3)',
                  border: `1px solid ${docType === 'iesire' ? 'var(--red)' : 'var(--border2)'}`,
                  color: docType === 'iesire' ? 'var(--red)' : 'var(--text2)',
                }}
                onClick={() => setDocType('iesire')}
              >
                <div>📤 Raport PLU</div>
                <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>↓ scade stocul</div>
              </button>
            </div>
          </div>

          {isPLU && (
            <div style={{ background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.35)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, fontSize: 13, color: '#b91c1c' }}>
              <strong>📤 Mod vânzări PLU</strong> — produsele selectate vor fi <strong>scăzute din stoc</strong>.
              Toate produsele trebuie să existe deja în catalog.
            </div>
          )}

          <div className="form-group">
            <label className="label">{isPLU ? 'Referință raport (opțional)' : 'Referință factură (opțional)'}</label>
            <input
              className="input"
              placeholder={isPLU ? 'ex: PLU 15 ian / Z-raport 042' : 'ex: Factură #123 / Furnizor X'}
              value={sursa}
              onChange={e => setSursa(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="label">{isPLU ? 'Imagine raport PLU' : 'Imagine factură'}</label>
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

            {/* Camera input — forces camera on mobile */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }}
            />
            {/* Gallery input — no capture, shows gallery/file picker */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }}
            />
          </div>

          {imageFile && (
            <button
              className="btn btn-primary"
              style={isPLU ? { background: '#dc2626', borderColor: '#dc2626' } : {}}
              onClick={startOCR}
            >
              🔍 Extrage text (OCR)
            </button>
          )}

          <div style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={addManualItem}>
              {isPLU ? '✏️ Adaugă vânzare manual' : '✏️ Introducere manuală (fără OCR)'}
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
          {isPLU && (
            <div style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>📤</span>
              <span><strong>Scădere stoc — PLU</strong> · Verifică fiecare produs înainte de a salva</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <span className={`badge ${isPLU ? 'badge-red' : 'badge-green'}`} style={{ marginRight: 6 }}>✓ {confirmedCount} {isPLU ? 'de scăzut' : 'OK'}</span>
              {needsReviewCount > 0 && <span className="badge badge-yellow">⚠ {needsReviewCount} necesită verificare</span>}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={addManualItem}>{isPLU ? '+ Adaugă vânzare' : '+ Adaugă'}</button>
          </div>

          {needsReviewCount > 0 && (
            <div className="alert alert-warning">
              {isPLU
                ? '⚠️ Unele linii OCR nu corespund niciunui produs din catalog. Selectează produsul corect sau ignoră linia.'
                : '⚠️ Unele produse nu au fost recunoscute automat. Completează datele pentru fiecare produs nou sau asociază-le la un produs existent.'}
            </div>
          )}

          {sortedItems.map(item => {
            const isNewProduct = item.needsReview && !item._productId;
            const canConfirm = (item._newName || '').trim().length > 0;

            if (isNewProduct) {
              if (isPLU) {
                // PLU mode: product MUST already exist — no catalog creation, only selection
                return (
                  <div key={item._idx} style={{ border: '2px solid #dc2626', borderRadius: 10, padding: 14, marginBottom: 10, background: 'rgba(220,38,38,0.05)' }}>
                    <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4, fontSize: 15 }}>
                      ❌ PRODUS NECUNOSCUT
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                      Text din raport PLU: <em>„{item.rawName}”</em>
                    </div>
                    <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 12 }}>
                      Produsul nu există în catalog. Selectează cel mai apropiat produs pentru a scădea stocul, sau ignoră această linie.
                    </div>

                    <div className="form-group">
                      <label className="label">Selectează produsul din catalog</label>
                      <select
                        className="input"
                        value={item._productId || ''}
                        onChange={e => assignProduct(item._idx, e.target.value)}
                      >
                        <option value="">— Alege produsul corespunzător —</option>
                        {allProducts.map(p => (
                          <option key={p.id} value={p.id}>{p.name}{p.isCustom ? ' ★' : ''}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 4 }}>
                      <div className="form-group" style={{ width: 80, margin: 0 }}>
                        <label className="label">Cantitate</label>
                        <input
                          className="input"
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => updateItem(item._idx, 'quantity', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div style={{ flex: 1 }} />
                      <button className="btn btn-secondary btn-sm" onClick={() => removeItem(item._idx)}>
                        🚫 Ignoră linia
                      </button>
                    </div>
                  </div>
                );
              }

              // Invoice mode: new product can be added to catalog
              return (
                <div key={item._idx} style={{ border: '2px solid #f59e0b', borderRadius: 10, padding: 14, marginBottom: 10, background: 'rgba(245,158,11,0.06)' }}>
                  <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 4, fontSize: 15 }}>
                    ⚠️ ATENȚIE — PRODUS NOU DETECTAT!
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                  Text detectat din factură: <em>„{item.rawName}”</em>
                  </div>

                  <div className="form-group">
                    <label className="label">Denumire produs (va fi salvat în catalog)</label>
                    <input
                      className="input"
                      placeholder="ex: Mașină tuns Wella Pro..."
                      value={item._newName || ''}
                      onChange={e => updateNewProductField(item._idx, '_newName', e.target.value)}
                    />
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
            } // end isNewProduct

            return (
              <div key={item._idx} className={`review-item ${item._confirmed ? 'confirmed' : ''}`}>
                {/* T1: line number */}
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
                    background: !item._productId ? '#fee2e2' : item.needsReview ? '#fef3c7' : '#dcfce7',
                    color: !item._productId ? '#b91c1c' : item.needsReview ? '#92400e' : '#166534',
                    whiteSpace: 'nowrap',
                    marginLeft: 8,
                    flexShrink: 0,
                  }}>
                    {!item._productId ? '⚪ Neselectat' : item.needsReview ? '🟡 Manual' : '🟢 Auto'}
                  </span>
                </div>

                <div className="form-group">
                  <label className="label">Produs</label>
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
                </div>

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

                {item._productId && isPLU && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>↓ se scade din stoc</div>
                )}
                {item._productId && !isPLU && item.needsReview && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#b45309' }}>⚠ verificare produs necesară (match ambiguu)</div>
                )}
              </div>
            );
          })}

          {parsedItems.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">{isPLU ? '📤' : '📋'}</div>
              <div className="empty-state-text">
                {isPLU ? 'Nicio vânzare detectată.' : 'Nicio linie detectată.'}<br/>
                {isPLU ? 'Adaugă manual produsele vândute.' : 'Adaugă manual produsele.'}
              </div>
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ marginTop: 16, ...(isPLU ? { background: '#dc2626', borderColor: '#dc2626' } : {}) }}
            onClick={saveTransaction}
            disabled={confirmedCount === 0}
          >
            {isPLU
              ? `📤 Înregistrează scădere stoc (${confirmedCount} produse)`
              : `💾 Salvează intrare stoc (${confirmedCount} produse)`}
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
            {isPLU
              ? <>{confirmedCount} produse au fost <strong style={{ color: '#dc2626' }}>scăzute din stoc</strong> (vânzare PLU).</>
              : <>{confirmedCount} produse au fost <strong style={{ color: 'var(--green)' }}>adăugate în stoc</strong> (factură).</>}
          </div>
          <button className="btn btn-primary" onClick={reset} style={{ marginBottom: 10, ...(isPLU ? { background: '#dc2626', borderColor: '#dc2626' } : {}) }}>
            {isPLU ? '📤 Adaugă alt raport PLU' : '📥 Adaugă altă factură'}
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('stock')}>
            📦 Vezi stocul
          </button>
        </div>
      )}
    </div>
  );
}
