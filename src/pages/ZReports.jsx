import { useState, useRef, useMemo } from 'react';
import { storage } from '../services/storage';
import { runClaudeZReport } from '../services/ocr';
import { useStock } from '../context/StockContext';
import { MAX_FILE_SIZE_BYTES, ZREPORT_TOLERANCE_RON } from '../constants';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function dateToLabel(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('ro-RO', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function pluTotalForDate(transactions, dateStr) {
  return transactions
    .filter(t => {
      if (t.tip !== 'iesire') return false;
      return t.createdAt?.slice(0, 10) === dateStr;
    })
    .reduce((sum, t) => {
      return sum + (t.items || []).reduce((s, item) => {
        return s + (item.pretVanzare || 0) * (item.cantitate || 0);
      }, 0);
    }, 0);
}

export default function ZReports() {
  const { transactions, zReports, refresh } = useStock();
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [data, setData] = useState(todayStr());
  const [sursa, setSursa] = useState('');
  const [totalRON, setTotalRON] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrRunning, setOcrRunning] = useState(false);
  const fileRef = useRef();

  function handleFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('Fișierul este prea mare (max 20 MB). Alege o imagine mai mică.');
      return;
    }
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setOcrStatus('');
  }

  async function runZOCR() {
    if (!imageFile) return;
    setOcrRunning(true);
    const result = await runClaudeZReport(imageFile, setOcrStatus);
    setOcrRunning(false);
    if (!result.success) {
      setOcrStatus('❌ Eroare: ' + result.error);
      return;
    }
    if (result.total !== null) {
      setTotalRON(result.total.toFixed(2));
      setOcrStatus(`✓ Total detectat: ${result.total.toFixed(2)} RON`);
    } else {
      setOcrStatus('⚠ Nu s-a putut detecta totalul automat. Introdu manual.');
    }
  }

  function saveReport() {
    const total = Number.parseFloat(totalRON);
    if (!data || Number.isNaN(total) || total <= 0) return;
    storage.saveZReport({
      data,
      sursa: sursa.trim() || `Z ${data}`,
      totalRON: total,
    });
    refresh();
    resetForm();
  }

  function deleteReport(id) {
    if (!confirm('Ștergi raportul Z?')) return;
    storage.deleteZReport(id);
    refresh();
  }

  function resetForm() {
    setData(todayStr());
    setSursa('');
    setTotalRON('');
    setImageFile(null);
    setImageUrl(null);
    setOcrStatus('');
    setShowForm(false);
  }

  const sortedReports = useMemo(() =>
    [...zReports].sort((a, b) => b.data?.localeCompare(a.data)),
    [zReports]
  );

  const totalDiff = sortedReports.reduce((acc, r) => {
    const plu = pluTotalForDate(transactions, r.data);
    return acc + (r.totalRON - plu);
  }, 0);

  return (
    <div>
      <p className="page-title">Rapoarte Z</p>
      <p className="page-sub">Comparativ casă de marcat vs PLU</p>

      {/* Summary */}
      {sortedReports.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <div className="stat-label">Z-uri înregistrate</div>
            <div className="stat-value small">{sortedReports.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Diferență totală</div>
            <div className={`stat-value small ${Math.abs(totalDiff) < ZREPORT_TOLERANCE_RON ? 'green' : totalDiff > 0 ? 'red' : ''}`}>
              {totalDiff > 0 ? '+' : ''}{totalDiff.toFixed(2)} RON
            </div>
          </div>
        </div>
      )}

      {/* Add button */}
      {!showForm && (
        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowForm(true)}>
          + Adaugă raport Z
        </button>
      )}

      {/* Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Raport Z nou</div>

          <div className="form-group">
            <label className="label">Data</label>
            <input
              type="date"
              className="input"
              value={data}
              max={todayStr()}
              onChange={e => setData(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="label">Denumire / Nr. Z (opțional)</label>
            <input
              className="input"
              placeholder="ex: Z #42"
              value={sursa}
              onChange={e => setSursa(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="label">Total încasat (RON)</label>
            <input
              type="number"
              className="input"
              placeholder="ex: 1245.50"
              min="0"
              step="0.01"
              value={totalRON}
              onChange={e => setTotalRON(e.target.value)}
            />
          </div>

          {/* OCR section */}
          <div className="form-group">
            <label className="label">Sau: scanează bonul Z (OCR)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
            {!imageFile ? (
              <div
                className="upload-zone"
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '2px dashed var(--border2)',
                  borderRadius: 12,
                  padding: '20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  color: 'var(--text3)',
                  fontSize: 13,
                }}
              >
                📷 Fă o poză sau alege imagine
              </div>
            ) : (
              <div>
                <img
                  src={imageUrl}
                  alt="bon Z"
                  style={{ width: '100%', borderRadius: 10, marginBottom: 8, maxHeight: 200, objectFit: 'cover' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={runZOCR}
                    disabled={ocrRunning}
                    style={{ flex: 1 }}
                  >
                    {ocrRunning ? '⏳ Se procesează...' : '🔍 Extrage total din imagine'}
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'var(--bg3)', color: 'var(--text2)' }}
                    onClick={() => { setImageFile(null); setImageUrl(null); setOcrStatus(''); }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
            {ocrStatus && (
              <div style={{ marginTop: 8, fontSize: 12, color: ocrStatus.startsWith('✓') ? 'var(--green)' : ocrStatus.startsWith('❌') ? 'var(--red)' : 'var(--text2)' }}>
                {ocrStatus}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={saveReport}
              disabled={!data || !totalRON || parseFloat(totalRON) <= 0}
            >
              💾 Salvează
            </button>
            <button
              className="btn"
              style={{ background: 'var(--bg3)', color: 'var(--text2)' }}
              onClick={resetForm}
            >
              Anulează
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {sortedReports.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🧾</div>
          <div className="empty-state-text">Niciun raport Z încă.<br />Adaugă primul raport pentru comparativ.</div>
        </div>
      ) : (
        sortedReports.map(r => {
          const plu = pluTotalForDate(transactions, r.data);
          const diff = r.totalRON - plu;
          const diffAbs = Math.abs(diff);
          const isOk = diffAbs < ZREPORT_TOLERANCE_RON;
          const diffColor = isOk ? 'var(--green)' : diff > 0 ? 'var(--red)' : 'var(--yellow)';

          return (
            <div key={r.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 500 }}>🧾 {r.sursa}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{dateToLabel(r.data)}</div>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => deleteReport(r.id)}
                  style={{ fontSize: 11, padding: '4px 8px' }}
                >
                  🗑
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Z Casa</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>{r.totalRON.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>RON</div>
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>PLU Sistem</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{plu.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>RON</div>
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Diferență</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: diffColor }}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>RON</div>
                </div>
              </div>

              {!isOk && (
                <div style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: diff > 0 ? 'rgba(224,92,92,0.1)' : 'rgba(232,193,80,0.1)',
                  fontSize: 12,
                  color: diffColor,
                }}>
                  {diff > 0
                    ? `⚠ Casa a înregistrat cu ${diff.toFixed(2)} RON mai mult decât PLU-ul din sistem.`
                    : `ℹ PLU-ul din sistem depășește casa cu ${(-diff).toFixed(2)} RON.`}
                </div>
              )}
              {isOk && (
                <div style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(76,175,125,0.1)',
                  fontSize: 12,
                  color: 'var(--green)',
                }}>
                  ✓ Sumele coincid.
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
