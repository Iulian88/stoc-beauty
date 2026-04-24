import { useState, useMemo } from 'react';
import { storage } from '../services/storage';
import { useStock } from '../context/StockContext';
import { PRODUCTS } from '../data/products';
import { PAGINATION_PAGE_SIZE as PAGE_SIZE } from '../constants';

export default function Transactions() {
  const { transactions, refresh } = useStock();
  const [expanded, setExpanded] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tipFilter, setTipFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editSursa, setEditSursa] = useState('');

  // Correction modal state
  const [correctingTx, setCorrectingTx] = useState(null);
  const [correctionItems, setCorrectionItems] = useState([]);
  const [correctionSursa, setCorrectionSursa] = useState('');
  const [corrAddSearch, setCorrAddSearch] = useState('');
  const [corrAddQty, setCorrAddQty] = useState(1);

  const allProducts = useMemo(() => [...PRODUCTS, ...storage.getCustomProducts()], [transactions]);

  const sorted = useMemo(() => [...transactions].reverse(), [transactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter(t => {
      const matchesTip = tipFilter === 'all' || t.tip === tipFilter;
      const matchesSearch = !q
        || t.sursa?.toLowerCase().includes(q)
        || t.items?.some(i => i.productName?.toLowerCase().includes(q));
      return matchesTip && matchesSearch;
    });
  }, [sorted, search, tipFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  function handleSearch(val) {
    setSearch(val);
    setCurrentPage(1);
  }

  function handleTip(val) {
    setTipFilter(val);
    setCurrentPage(1);
  }

  function deleteTransaction(id) {
    const t = transactions.find(tx => tx.id === id);
    if (!t) return;
    const lines = t.items?.map(i => {
      const sign = t.tip === 'intrare' ? '-' : '+';
      return `  • ${i.productName}: ${sign}${i.cantitate} buc`;
    }).join('\n') || '';
    const totalBuc = t.items?.reduce((s, i) => s + i.cantitate, 0) || 0;
    const impactMsg = t.tip === 'intrare'
      ? `Stocul va SCĂDEA cu ${totalBuc} buc total`
      : `Stocul va CREȘTE cu ${totalBuc} buc total`;
    if (!confirm(`Ștergi "${t.sursa}"?\n\nImpact stoc:\n${lines}\n\n${impactMsg}\n\nFolosește Stornare pentru a păstra istoricul.`)) return;
    storage.deleteTransaction(id);
    refresh();
  }

  function handleCorectare(t) {
    try {
      storage.createStornare(t.id);
      refresh();
    } catch (e) {
      alert(e.message);
      return;
    }
    setCorrectionItems(t.items?.map(i => ({ ...i })) || []);
    setCorrectionSursa(`Corecție: ${t.sursa}`);
    setCorrAddSearch('');
    setCorrAddQty(1);
    setCorrectingTx(t);
  }

  function closeCorrectionModal() {
    setCorrectingTx(null);
    setCorrectionItems([]);
  }

  function corrUpdateQty(productId, val) {
    const n = parseInt(val, 10);
    setCorrectionItems(prev => prev.map(i =>
      i.productId === productId ? { ...i, cantitate: isNaN(n) ? 0 : Math.max(0, n) } : i
    ));
  }

  function corrRemoveItem(productId) {
    setCorrectionItems(prev => prev.filter(i => i.productId !== productId));
  }

  const corrAddFiltered = useMemo(() => {
    const q = corrAddSearch.trim().toLowerCase();
    if (!q) return [];
    const usedIds = new Set(correctionItems.map(i => i.productId));
    return allProducts.filter(p => p.name.toLowerCase().includes(q) && !usedIds.has(p.id)).slice(0, 5);
  }, [corrAddSearch, correctionItems, allProducts]);

  function corrAddProduct(product) {
    setCorrectionItems(prev => [...prev, { productId: product.id, productName: product.name, cantitate: Math.max(1, corrAddQty) }]);
    setCorrAddSearch('');
    setCorrAddQty(1);
  }

  function saveCorrectionTx() {
    const validItems = correctionItems.filter(i => i.cantitate > 0);
    if (validItems.length === 0) { alert('Adaugă cel puțin un produs cu cantitate > 0.'); return; }
    try {
      storage.saveTransaction({ tip: correctingTx.tip, sursa: correctionSursa, items: validItems });
      refresh();
      closeCorrectionModal();
    } catch (e) {
      alert(e.message);
    }
  }

  function handleUndoStornare(stornareId, sursa) {
    if (!confirm(`Anulezi corecția "${sursa}"?\nTranzacția originală va fi restaurată la starea activă.`)) return;
    storage.deleteTransaction(stornareId);
    refresh();
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditSursa(t.sursa);
    setExpanded(t.id);
  }

  function saveEdit(id) {
    const val = editSursa.trim();
    if (!val) return;
    storage.editTransactionMeta(id, { sursa: val });
    setEditingId(null);
    refresh();
  }

  function cancelEdit() {
    setEditingId(null);
  }

  const emptyState = (() => {
    if (sorted.length === 0) {
      return <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">Nicio tranzacție încă.</div></div>;
    }
    if (filtered.length === 0) {
      return <div className="empty-state"><div className="empty-state-icon">🔍</div><div className="empty-state-text">Niciun rezultat pentru filtrele selectate.</div></div>;
    }
    return null;
  })();

  return (
    <div>
      <p className="page-title">Istoric tranzacții</p>
      <p className="page-sub">{transactions.length} tranzacții înregistrate</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          className="input"
          placeholder="Caută după sursă sau produs…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <select
          className="input"
          value={tipFilter}
          onChange={e => handleTip(e.target.value)}
          style={{ width: 140 }}
        >
          <option value="all">Toate tipurile</option>
          <option value="intrare">📥 Intrare</option>
          <option value="iesire">📤 Ieșire</option>
        </select>
      </div>

      {filtered.length < transactions.length && (
        <p className="page-sub" style={{ marginBottom: 8 }}>
          {filtered.length} rezultate filtrate
        </p>
      )}

      {emptyState}
      {emptyState === null && (
        <>
          {paginated.map(t => (
          <div
            key={t.id}
            className="card"
            style={{
              marginBottom: 10,
              opacity: t._stornat ? 0.5 : 1,
              borderLeft: t._stornare ? '3px solid #f59e0b' : undefined,
              background: t._stornat ? 'var(--surface2, #f5f5f5)' : undefined,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingId === t.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <input
                      className="input"
                      style={{ flex: 1, fontSize: 13, padding: '4px 8px' }}
                      value={editSursa}
                      onChange={e => setEditSursa(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') cancelEdit(); }}
                      autoFocus
                    />
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(t.id)}>💾</button>
                    <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>✕</button>
                  </div>
                ) : (
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>
                    {t.tip === 'intrare' ? '📥' : '📤'} {t.sursa}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                  {new Date(t.createdAt).toLocaleString('ro-RO')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {t._stornat && (
                  <span className="badge" style={{ background: '#9ca3af', color: '#fff' }}>STORNAT</span>
                )}
                {t._stornare && (
                  <span className="badge" style={{ background: '#f59e0b', color: '#fff' }}>⚠️ CORECȚIE</span>
                )}
                <span className={`badge ${t.tip === 'intrare' ? 'badge-green' : 'badge-red'}`}>
                  {t.tip === 'intrare' ? '↑ Intrare' : '↓ Ieșire'}
                </span>
              </div>
            </div>

            <div className="divider" style={{ margin: '10px 0' }} />

            <div
              style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}
              onClick={() => setExpanded(expanded === t.id ? null : t.id)}
            >
              {t.items?.length || 0} produse {expanded === t.id ? '▲' : '▼'}
            </div>

            {expanded === t.id && (
              <div style={{ marginTop: 10 }}>
                {t.items?.map((item, i) => (
                  <div key={i} className="list-item">
                    <div className="list-item-name">{item.productName}</div>
                    <span className="badge badge-gold">{item.cantitate} buc</span>
                  </div>
                ))}

                <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {/* Active transaction — show correction + edit + delete options */}
                  {!t._stornat && !t._stornare && (
                    <>
                      <button
                        className="btn btn-secondary btn-sm"
                        title="Editează doar sursa (nu afectează stocul)"
                        onClick={() => startEdit(t)}
                        disabled={editingId === t.id}
                      >
                        ✏️ Sursă
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}
                        title="Corectează: stornare automată + editor pre-completat"
                        onClick={() => handleCorectare(t)}
                      >
                        ✏️ Corectează
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        title="Șterge definitiv cu preview impact stoc"
                        onClick={() => deleteTransaction(t.id)}
                      >
                        🗑 Șterge
                      </button>
                    </>
                  )}

                  {/* Stornare entry — allow undoing the correction */}
                  {t._stornare && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleUndoStornare(t.id, t.sursa)}
                    >
                      ↩ Anulează corecția
                    </button>
                  )}

                  {/* Stornat original — read-only, direct to original's stornare */}
                  {t._stornat && (
                    <span style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>
                      Tranzacție stornată — nu se poate modifica
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 12 }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={safePage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                Pagina {safePage} / {totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={safePage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              >
                Următor →
              </button>
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => storage.exportJSON()}>
          💾 Export JSON
        </button>
      </div>

      {/* ── Correction modal ──────────────────────────────────────────── */}
      {correctingTx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg2)', color: 'var(--text)', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px 16px 0 0', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>✏️ Corectează tranzacție</div>
              <button className="btn btn-secondary btn-sm" onClick={closeCorrectionModal}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, padding: '8px 10px', background: 'var(--bg3, #f5f5f5)', borderRadius: 8 }}>
              Tranzacția originală a fost stornată automat. Completează versiunea corectă:
            </div>

            <div className="form-group">
              <label className="form-label">Sursă</label>
              <input className="input" value={correctionSursa} onChange={e => setCorrectionSursa(e.target.value)} />
            </div>

            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 13 }}>Produse:</div>
            {correctionItems.map(item => (
              <div key={item.productId} className="list-item" style={{ marginBottom: 6 }}>
                <div className="list-item-name" style={{ flex: 1 }}>{item.productName}</div>
                <input
                  type="number" min="0"
                  className="input"
                  style={{ width: 64, textAlign: 'center', padding: '4px 6px', fontSize: 13 }}
                  value={item.cantitate}
                  onChange={e => corrUpdateQty(item.productId, e.target.value)}
                />
                <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 4 }}>buc</span>
                <button className="btn btn-sm" style={{ marginLeft: 6, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} onClick={() => corrRemoveItem(item.productId)}>🗑</button>
              </div>
            ))}

            <div style={{ marginTop: 12, marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Adaugă produs:</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <input
                className="input"
                placeholder="Caută produs…"
                style={{ flex: 1, fontSize: 13 }}
                value={corrAddSearch}
                onChange={e => setCorrAddSearch(e.target.value)}
              />
              <input
                type="number" min="1"
                className="input"
                style={{ width: 60, textAlign: 'center', fontSize: 13 }}
                value={corrAddQty}
                onChange={e => setCorrAddQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>
            {corrAddFiltered.map(p => (
              <div key={p.id} className="list-item" style={{ cursor: 'pointer', marginBottom: 4 }} onClick={() => corrAddProduct(p)}>
                <div className="list-item-name">{p.name}</div>
                <span className="badge badge-green">+ Adaugă</span>
              </div>
            ))}

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 16 }}
              onClick={saveCorrectionTx}
            >
              💾 Salvează tranzacție corectată
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
