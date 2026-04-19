import { useState, useMemo } from 'react';
import { useStock } from '../context/StockContext';
import { storage } from '../services/storage';

export default function Inventory() {
  const { stock, refresh } = useStock();
  const [counts, setCounts] = useState({});
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.values(stock)
      .filter(s => !q || s.product.name.toLowerCase().includes(q))
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [stock, search]);

  const diffs = useMemo(() => {
    const result = {};
    Object.values(stock).forEach(s => {
      const raw = counts[s.product.id];
      if (raw === undefined || raw === '') return;
      const real = parseInt(raw, 10);
      if (isNaN(real)) return;
      const diff = real - s.stoc;
      if (diff !== 0) result[s.product.id] = { product: s.product, stoc: s.stoc, real, diff };
    });
    return result;
  }, [counts, stock]);

  const diffList = Object.values(diffs);

  function applyInventory() {
    if (diffList.length === 0) return;

    const intrariItems = diffList
      .filter(d => d.diff > 0)
      .map(d => ({ productId: d.product.id, productName: d.product.name, cantitate: d.diff }));

    const iesiriItems = diffList
      .filter(d => d.diff < 0)
      .map(d => ({ productId: d.product.id, productName: d.product.name, cantitate: -d.diff }));

    try {
      if (intrariItems.length > 0) {
        storage.saveTransaction({ tip: 'intrare', sursa: 'corecție inventar', items: intrariItems });
      }
      if (iesiriItems.length > 0) {
        // Inventory corrections bypass stock validation (_skipStockValidation)
        storage.saveTransaction({ tip: 'iesire', sursa: 'corecție inventar', items: iesiriItems, _skipStockValidation: true });
      }
      refresh();
      setSaved(true);
      setCounts({});
    } catch (e) {
      alert(e.message);
    }
  }

  function reset() {
    setCounts({});
    setSaved(false);
  }

  if (saved) {
    return (
      <div>
        <p className="page-title">Inventar</p>
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Corecții aplicate!</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
            Stocul a fost actualizat cu valorile din inventar.
          </div>
          <button className="btn btn-primary" onClick={reset}>Inventar nou</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="page-title">Inventar manual</p>
      <p className="page-sub">Introdu cantitățile reale — sistemul calculează diferențele</p>

      <div className="form-group">
        <input
          className="input"
          placeholder="🔍 Caută produs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {diffList.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: 12 }}>
          <div className="card-title" style={{ color: '#b45309' }}>
            📋 Diferențe detectate ({diffList.length} produse)
          </div>
          {diffList.map(d => (
            <div key={d.product.id} className="list-item">
              <div className="list-item-name">{d.product.name}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
                  sistem: {d.stoc}
                </span>
                <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
                  real: {d.real}
                </span>
                <span className={`badge ${d.diff > 0 ? 'badge-green' : 'badge-red'}`}>
                  {d.diff > 0 ? `+${d.diff}` : d.diff} buc
                </span>
              </div>
            </div>
          ))}
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 12 }}
            onClick={applyInventory}
          >
            ✅ Aplică corecții ({diffList.length})
          </button>
        </div>
      )}

      <div className="card">
        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-text">Niciun produs găsit.</div>
          </div>
        ) : (
          items.map(({ product, stoc }) => (
            <div key={product.id} className="list-item" style={{ gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="list-item-name">{product.name}</div>
                <div className="list-item-meta">sistem: {stoc} buc</div>
              </div>
              <input
                type="number"
                min="0"
                className="input"
                placeholder="real"
                style={{ width: 72, textAlign: 'center', padding: '4px 6px', fontSize: 13 }}
                value={counts[product.id] ?? ''}
                onChange={e => setCounts(prev => ({ ...prev, [product.id]: e.target.value }))}
              />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>buc</span>
            </div>
          ))
        )}
      </div>

      {diffList.length === 0 && Object.keys(counts).length > 0 && (
        <div className="card" style={{ marginTop: 8, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          ✓ Toate cantitățile introduse corespund cu stocul din sistem.
        </div>
      )}
    </div>
  );
}
