import { useState, useMemo } from 'react';
import { storage } from '../services/storage';
import { useStock } from '../context/StockContext';
import { PAGINATION_PAGE_SIZE as PAGE_SIZE } from '../constants';

export default function Transactions() {
  const { transactions, refresh } = useStock();
  const [expanded, setExpanded] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tipFilter, setTipFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editSursa, setEditSursa] = useState('');

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
    if (!confirm('Ștergi această tranzacție? Stocul se va recalcula automat.\n(Folosește "Stornare" dacă vrei să păstrezi istoricul corecțiilor.)')) return;
    storage.deleteTransaction(id);
    refresh();
  }

  function handleStornare(t) {
    if (!confirm(
      `Stornezi tranzacția "${t.sursa}"?\n\n` +
      `Se va crea o intrare de anulare automată. ` +
      `Tranzacția originală rămâne vizibilă ca "stornată".\n\n` +
      `Apoi vei putea introduce una corectă din Upload.`
    )) return;
    try {
      storage.createStornare(t.id);
      refresh();
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
                    <div>
                      <div className="list-item-name">{item.productName}</div>
                      <div className="list-item-meta">
                        {item.pretAchizitie} RON/buc · total: {(item.pretAchizitie * item.cantitate).toFixed(2)} RON
                      </div>
                    </div>
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
                        style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}
                        title="Stornare: anulează această tranzacție și păstrează istoricul"
                        onClick={() => handleStornare(t)}
                      >
                        🔧 Stornare
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        title="Șterge definitiv (pierde istoricul)"
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
    </div>
  );
}
