import { storage } from '../services/storage';
import { useStock } from '../context/StockContext';
import { LOW_STOCK_THRESHOLD } from '../constants';

export default function Dashboard({ onNavigate }) {
  const { stock, transactions } = useStock();

  const totalTransactions = transactions.length;
  const intrari = transactions.filter(t => t.tip === 'intrare').length;
  const iesiri = transactions.filter(t => t.tip === 'iesire').length;

  const stockItems = Object.values(stock);
  const subStoc = stockItems.filter(s => s.stoc <= 0).length;
  const okStoc = stockItems.filter(s => s.stoc > 0).length;
  const lowStock = stockItems.filter(s => s.stoc > 0 && s.stoc <= LOW_STOCK_THRESHOLD);

  // Stock value computed from historical transaction purchase prices (not catalog)
  const valoareStoc = storage.computeWeightedStockValue(stock);

  const profit = storage.computeProfitBrut(); // kept for backward compat
  const fin = storage.computeFinancials();
  const recentTransactions = [...transactions].reverse().slice(0, 5);

  return (
    <div>
      <p className="page-title">Dashboard</p>
      <p className="page-sub">{new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Produse în stoc</div>
          <div className={`stat-value ${okStoc === 0 ? 'red' : 'green'}`}>{okStoc}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stoc epuizat</div>
          <div className={`stat-value ${subStoc > 0 ? 'red' : ''}`}>{subStoc}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Valoare stoc</div>
          <div className="stat-value gold small">{valoareStoc.toFixed(0)} RON</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tranzacții</div>
          <div className="stat-value small">{totalTransactions}</div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">📥 Facturi</div>
          <div className="stat-value small">{intrari}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">📤 Rapoarte PLU</div>
          <div className="stat-value small">{iesiri}</div>
        </div>
      </div>

      {fin.venituri > 0 || fin.cheltuieli > 0 ? (
        <>
          <p className="page-sub" style={{ marginTop: 16, marginBottom: 8, fontWeight: 600, fontSize: 13, color: 'var(--text2)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Financiar
          </p>

          {/* Row 1 — Cash flow */}
          <div className="stat-grid">
            <div className="stat-card" style={{ borderLeft: '3px solid var(--green)' }}>
              <div className="stat-label">💰 Casă (vânzări)</div>
              <div className="stat-value small green">{fin.venituri.toFixed(0)} RON</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>încasări din PLU</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid var(--red)' }}>
              <div className="stat-label">🧾 Facturi plătite</div>
              <div className="stat-value small red">{fin.cheltuieli.toFixed(0)} RON</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>cheltuieli stoc</div>
            </div>
          </div>

          {/* Row 2 — Profit */}
          <div className="stat-grid">
            <div className="stat-card" style={{ borderLeft: `3px solid ${fin.profitBrut >= 0 ? 'var(--green)' : 'var(--red)'}` }}>
              <div className="stat-label">📊 Profit brut</div>
              <div className={`stat-value small ${fin.profitBrut >= 0 ? 'green' : 'red'}`}>{fin.profitBrut.toFixed(0)} RON</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>vânzări − cost mărfuri</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">📈 Marjă</div>
              <div className={`stat-value small ${fin.marja >= 0 ? 'green' : 'red'}`}>{fin.marja.toFixed(1)}%</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>din vânzări</div>
            </div>
          </div>

          {/* Cash reconciliation hint */}
          <div style={{
            background: 'var(--bg3)',
            border: '1px solid var(--border2)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 12,
            fontSize: 12,
            color: 'var(--text2)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>🏧 Reconciliere casă</div>
            <div>
              Ar trebui să ai <strong style={{ color: 'var(--green)' }}>{fin.venituri.toFixed(2)} RON</strong> în casă.
              {fin.fluxNet !== 0 && (
                <> Fluxul net (casă − facturi) este{' '}
                  <strong style={{ color: fin.fluxNet >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {fin.fluxNet >= 0 ? '+' : ''}{fin.fluxNet.toFixed(2)} RON
                  </strong>.
                </>
              )}
            </div>
            <div style={{ marginTop: 4, color: 'var(--text3)' }}>
              Compară cu totalul din Z-raportul zilei pentru a verifica concordanța.
            </div>
          </div>
        </>
      ) : null}

      {lowStock.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: 12 }}>
          <div className="card-title" style={{ color: '#b45309' }}>⚠️ Stoc scăzut ({lowStock.length} produse)</div>
          {lowStock.map(s => (
            <div key={s.product.id} className="list-item">
              <div className="list-item-name">{s.product.nume}</div>
              <span className="badge badge-gold">{s.stoc} buc</span>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => onNavigate('upload')}>
        📸 Adaugă factură / PLU
      </button>

      <div className="card">
        <div className="card-title">Activitate recentă</div>
        {recentTransactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-text">Nicio tranzacție încă.<br/>Adaugă prima factură sau PLU.</div>
          </div>
        ) : (
          recentTransactions.map(t => (
            <div key={t.id} className="list-item">
              <div>
                <div className="list-item-name">{t.tip === 'intrare' ? '📥' : '📤'} {t.sursa || (t.tip === 'intrare' ? 'Factură' : 'Raport PLU')}</div>
                <div className="list-item-meta">{t.items?.length || 0} produse · {new Date(t.createdAt).toLocaleDateString('ro-RO')}</div>
              </div>
              <span className={`badge ${t.tip === 'intrare' ? 'badge-green' : 'badge-red'}`}>
                {t.tip === 'intrare' ? '↑ Intrare' : '↓ Ieșire'}
              </span>
            </div>
          ))
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => storage.exportJSON()}>
          💾 Export JSON
        </button>
      </div>
    </div>
  );
}
