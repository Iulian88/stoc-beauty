import { useState, useMemo } from 'react';
import { useStock } from '../context/StockContext';

export default function Stock() {
  const { stock } = useStock();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const items = useMemo(() => {
    return Object.values(stock)
      .filter(s => {
        if (filter === 'ok') return s.stoc > 0;
        if (filter === 'epuizat') return s.stoc <= 0;
        return true;
      })
      .filter(s => {
        if (!search) return true;
        return s.product.name.toLowerCase().includes(search.toLowerCase());
      })
      .sort((a, b) => b.stoc - a.stoc);
  }, [stock, filter, search]);

  const valoareTotala = Object.values(stock).reduce((acc, s) => {
    return acc + (s.stoc > 0 ? s.stoc * s.product.pretAchizitie : 0);
  }, 0);

  const epuizate = Object.values(stock).filter(s => s.stoc <= 0).length;
  const disponibile = Object.values(stock).filter(s => s.stoc > 0).length;

  return (
    <div>
      <p className="page-title">Stoc curent</p>
      <p className="page-sub">Calculat automat din tranzacții</p>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Disponibile</div>
          <div className="stat-value green">{disponibile}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Epuizate</div>
          <div className={`stat-value ${epuizate > 0 ? 'red' : ''}`}>{epuizate}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['all', 'ok', 'epuizat'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="btn btn-sm"
              style={{
                background: filter === f ? 'var(--accent)' : 'var(--bg3)',
                color: filter === f ? '#0f0f0f' : 'var(--text2)',
                border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border2)'}`,
              }}
            >
              {f === 'all' ? 'Toate' : f === 'ok' ? '✓ În stoc' : '✗ Epuizate'}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <input
          className="input"
          placeholder="🔍 Caută produs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-text">Nicio tranzacție înregistrată.<br/>Adaugă o factură pentru a vedea stocul.</div>
          </div>
        ) : (
          items.map(({ product, stoc, intrari, iesiri }) => (
            <div key={product.id} className="list-item">
              <div style={{ flex: 1 }}>
                <div className="list-item-name">{product.name}</div>
                <div className="list-item-meta">
                  ↑{intrari} intrări · ↓{iesiri} ieșiri
                  {stoc > 0 && <span> · {(stoc * product.pretAchizitie).toFixed(2)} RON val.</span>}
                </div>
              </div>
              <div className="list-item-right">
                <span className={`badge ${stoc > 3 ? 'badge-green' : stoc > 0 ? 'badge-yellow' : 'badge-red'}`}>
                  {stoc > 0 ? `${stoc} buc` : 'Epuizat'}
                </span>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  {product.pretAchizitie} RON
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="stat-label">Valoare totală stoc (preț achiziție)</div>
        <div className="stat-value gold">{valoareTotala.toFixed(2)} RON</div>
      </div>
    </div>
  );
}
