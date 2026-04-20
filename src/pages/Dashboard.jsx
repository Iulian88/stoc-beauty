import { useState } from 'react';
import { storage } from '../services/storage';
import { useStock } from '../context/StockContext';

const ON_TERMINATE_THRESHOLD = 3;

export default function Dashboard({ onNavigate }) {
  const { stock, transactions, refresh } = useStock();
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(null);

  const dirty = storage.getHasUnsavedChanges();

  function handleExport() {
    storage.exportJSON();
    refresh(); // update dirty state in UI
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-selecting same file
    setImportError(null);
    setImportSuccess(null);

    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setImportError('Fișierul nu este JSON valid.');
      return;
    }

    if (!confirm(
      '⚠ Această acțiune va suprascrie TOATE datele existente (tranzacții + produse custom).\n\nSigur vrei să continui?'
    )) return;

    try {
      const result = storage.importJSON(data);
      refresh();
      setImportSuccess(`Import reușit: ${result.count} tranzacții restaurate.`);
    } catch (err) {
      setImportError(err.message);
    }
  }

  const intrari = transactions.filter(t => t.tip === 'intrare').length;
  const iesiri = transactions.filter(t => t.tip === 'iesire').length;

  const stockItems = Object.values(stock);
  const subStoc = stockItems.filter(s => s.stoc <= 0 && !s.isNegative).length;
  const negative = stockItems.filter(s => s.isNegative);
  const okStoc = stockItems.filter(s => s.stoc > 0).length;
  const peTerminate = stockItems.filter(s => s.stoc > 0 && s.stoc <= ON_TERMINATE_THRESHOLD);

  const topVandute = [...stockItems]
    .filter(s => s.iesiri > 0)
    .sort((a, b) => b.iesiri - a.iesiri)
    .slice(0, 5);

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
          <div className={`stat-value ${(subStoc + negative.length) > 0 ? 'red' : ''}`}>{subStoc + negative.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">📥 Intrări</div>
          <div className="stat-value small">{intrari}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">📤 Vânzări</div>
          <div className="stat-value small">{iesiri}</div>
        </div>
      </div>

      {negative.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #dc2626', marginBottom: 12 }}>
          <div className="card-title" style={{ color: '#dc2626' }}>⚠ Probleme stoc ({negative.length})</div>
          {negative.map(s => (
            <div key={s.product.id} className="list-item">
              <div className="list-item-name">{s.product.name}</div>
              <span className="badge badge-red">STOC NEGATIV: {s.stoc}</span>
            </div>
          ))}
        </div>
      )}

      {peTerminate.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: 12 }}>
          <div className="card-title" style={{ color: '#b45309' }}>⚠️ Produse pe terminate ({peTerminate.length})</div>
          {peTerminate.map(s => (
            <div key={s.product.id} className="list-item">
              <div className="list-item-name">{s.product.name}</div>
              <span className="badge badge-gold">{s.stoc} buc</span>
            </div>
          ))}
        </div>
      )}

      {topVandute.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">🏆 Top produse vândute</div>
          {topVandute.map((s, i) => (
            <div key={s.product.id} className="list-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text3)', width: 16 }}>{i + 1}.</span>
                <div className="list-item-name">{s.product.name}</div>
              </div>
              <span className="badge badge-red">{s.iesiri} buc</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onNavigate('upload')}>
          📥 Adaugă intrare
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1, background: '#dc2626', borderColor: '#dc2626' }}
          onClick={() => onNavigate('upload')}
        >
          🛒 Introdu vânzări
        </button>
      </div>

      <div className="card">
        <div className="card-title">Activitate recentă</div>
        {recentTransactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-text">Nicio tranzacție încă.<br/>Adaugă prima factură sau vânzare.</div>
          </div>
        ) : (
          recentTransactions.map(t => (
            <div key={t.id} className="list-item">
              <div>
                <div className="list-item-name">
                  {t.tip === 'intrare' ? '📥' : '📤'} {t.sursa || (t.tip === 'intrare' ? 'Factură' : 'Vânzări')}
                </div>
                <div className="list-item-meta">{t.items?.length || 0} produse · {new Date(t.createdAt).toLocaleDateString('ro-RO')}</div>
              </div>
              <span className={`badge ${t.tip === 'intrare' ? 'badge-green' : 'badge-red'}`}>
                {t.tip === 'intrare' ? '↑ Intrare' : '↓ Ieșire'}
              </span>
            </div>
          ))
        )}
      </div>

      {/* ── Backup controls ──────────────────────────────────────── */}
      {dirty && (
        <div
          className="card"
          style={{ borderLeft: '4px solid #f59e0b', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}
        >
          <div style={{ fontWeight: 500, color: '#b45309', fontSize: 13 }}>
            ⚠ Ai modificări nesalvate
          </div>
          <button
            className="btn btn-sm"
            style={{ background: '#f59e0b', color: '#000', border: 'none', fontWeight: 600, cursor: 'pointer' }}
            onClick={handleExport}
          >
            💾 Export backup
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
          📥 Import backup
          <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
        </label>
      </div>
      {importError && (
        <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>❌ {importError}</div>
      )}
      {importSuccess && (
        <div style={{ color: '#16a34a', fontSize: 12, marginTop: 4 }}>✅ {importSuccess}</div>
      )}
    </div>
  );
}
