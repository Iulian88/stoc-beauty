import { useState, useRef, useEffect } from 'react';
import { PRODUCTS } from '../data/products';
import { storage } from '../services/storage';

// ── Badge styles ──────────────────────────────────────────────────────────────
const BADGE_STYLES = {
  AUTO:           { background: 'rgba(76,175,125,0.15)', border: '1px solid var(--green)', color: 'var(--green)' },
  MANUAL:         { background: 'rgba(99,102,241,0.15)', border: '1px solid #6366f1',     color: '#6366f1' },
  'NEEDS REVIEW': { background: 'rgba(245,158,11,0.15)', border: '1px solid #f59e0b',     color: '#b45309' },
};

const SOURCE_LABEL = {
  mapping_high:   'split ML',
  mapping_low:    'LOW RISK',
  mapping_medium: 'MEDIUM RISK',
  alias:          'alias catalog',
  manual:         'mapat manual',
};

// Unique stable key for an unmatched item
function itemKey(item) {
  return `${item.ejName}|${item.line ?? ''}`;
}

// ── Shared Badge component ────────────────────────────────────────────────────
function Badge({ text, style }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 7px',
      borderRadius: 20,
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {text}
    </span>
  );
}

// ── RecognizedList ────────────────────────────────────────────────────────────
function RecognizedList({ items, onUnresolve }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 5);

  return (
    <div>
      {visible.map((item, i) => {
        const isManual = item.matchType === 'MANUAL';
        return (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '9px 0',
            borderBottom: '1px solid var(--border1)',
          }}>
            {/* Qty bubble */}
            <div style={{
              flexShrink: 0,
              width: 30,
              height: 30,
              borderRadius: 8,
              background: isManual ? 'rgba(99,102,241,0.12)' : 'rgba(76,175,125,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 12,
              color: isManual ? '#6366f1' : 'var(--green)',
            }}>
              {item.qty % 1 === 0 ? item.qty : item.qty.toFixed(2)}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.ejName}</span>
                {item.mlDetected && (
                  <span style={{ color: 'var(--text3)', marginLeft: 4, fontSize: 10 }}>
                    [{item.mlDetected}]
                  </span>
                )}
              </div>
              <div style={{
                fontWeight: 600,
                fontSize: 13,
                color: isManual ? '#6366f1' : 'var(--text1)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {item.catalogName}
              </div>
              {item.price != null && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                  {item.price} RON · linia {item.line}
                </div>
              )}
              {isManual && (
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
                  alias salvat în catalog
                </div>
              )}
            </div>

            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <Badge text={item.matchType} style={BADGE_STYLES[item.matchType] ?? {}} />
              <Badge
                text={SOURCE_LABEL[item.matchSource] ?? item.matchSource}
                style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text3)' }}
              />
              {isManual && onUnresolve && (
                <button
                  onClick={() => onUnresolve(item._key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 10,
                    color: 'var(--text3)',
                    cursor: 'pointer',
                    padding: 0,
                    marginTop: 2,
                  }}
                >
                  ✕ anulează
                </button>
              )}
            </div>
          </div>
        );
      })}

      {items.length > 5 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: 13,
            cursor: 'pointer',
            padding: '8px 0',
            width: '100%',
            textAlign: 'center',
          }}
        >
          {expanded
            ? '▲ Arată mai puțin'
            : `▼ Arată toate (${items.length - 5} mai mult)`}
        </button>
      )}
    </div>
  );
}

// ── UnmatchedRow ──────────────────────────────────────────────────────────────
function UnmatchedRow({ item, onResolve }) {
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);
  const wrapRef             = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const term    = search.trim().toLowerCase();
  const results = term.length >= 1
    ? PRODUCTS.filter(p => p.name.toLowerCase().includes(term)).slice(0, 8)
    : [];

  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid var(--border1)' }}>
      {/* EJ name + reason */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text1)', fontFamily: 'monospace' }}>
            {item.ejName}
            {item.mlDetected && (
              <span style={{ color: 'var(--text3)', marginLeft: 6, fontFamily: 'inherit', fontWeight: 400, fontSize: 11 }}>
                [{item.mlDetected}]
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>{item.reason}</div>
        </div>
        <Badge
          text="NEEDS REVIEW"
          style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid #dc2626', color: '#dc2626' }}
        />
      </div>

      {/* raw_context chip */}
      {item.rawContext && (
        <div style={{
          marginBottom: 8,
          fontSize: 10,
          color: 'var(--text3)',
          fontFamily: 'monospace',
          background: 'var(--bg3)',
          padding: '3px 7px',
          borderRadius: 5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {item.rawContext}
        </div>
      )}

      {/* Typeahead product picker */}
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <input
          className="input"
          type="text"
          placeholder="Caută produs în catalog…"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => term && setOpen(true)}
          style={{ fontSize: 12, padding: '6px 10px', width: '100%', boxSizing: 'border-box' }}
        />

        {open && results.length > 0 && (
          <div style={{
            position: 'absolute',
            zIndex: 200,
            left: 0,
            right: 0,
            top: 'calc(100% + 3px)',
            background: 'var(--bg2)',
            border: '1px solid var(--border2)',
            borderRadius: 8,
            boxShadow: '0 6px 20px rgba(0,0,0,0.20)',
            overflow: 'hidden',
          }}>
            {results.map(prod => (
              <button
                key={prod.id}
                onMouseDown={e => {
                  e.preventDefault();
                  onResolve(prod.id, prod.name);
                  setSearch('');
                  setOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid var(--border1)',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--text1)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{ fontWeight: 600 }}>{prod.name}</div>
                {prod.pretVanzare != null && (
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
                    {prod.pretVanzare} RON
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {open && term.length >= 1 && results.length === 0 && (
          <div style={{
            position: 'absolute',
            zIndex: 200,
            left: 0,
            right: 0,
            top: 'calc(100% + 3px)',
            background: 'var(--bg2)',
            border: '1px solid var(--border2)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12,
            color: 'var(--text3)',
          }}>
            Niciun produs găsit pentru „{search}"
          </div>
        )}
      </div>
    </div>
  );
}

// ── UnmatchedSection ──────────────────────────────────────────────────────────
function UnmatchedSection({ items, onResolve }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 5);

  return (
    <div>
      {visible.map((item, i) => (
        <UnmatchedRow
          key={`${item.ejName}|${item.line ?? i}`}
          item={item}
          onResolve={(productId, catalogName) =>
            onResolve(itemKey(item), productId, catalogName, item.ejName)
          }
        />
      ))}

      {items.length > 5 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: 13,
            cursor: 'pointer',
            padding: '8px 0',
            width: '100%',
            textAlign: 'center',
          }}
        >
          {expanded
            ? '▲ Arată mai puțin'
            : `▼ Arată toate (${items.length - 5} mai mult)`}
        </button>
      )}
    </div>
  );
}

/**
 * EJImportPreview
 *
 * Displays the result of processEJImport() with manual resolution for
 * unmatched items. Aliases are saved to localStorage immediately on
 * selection. No transactions or stock are modified.
 *
 * Props:
 *   preview  — { recognized, unmatched, skipped }
 *   fileName — original file name (display only)
 *   onReset  — callback to clear and select a different file
 */
export default function EJImportPreview({ preview, fileName, onReset }) {
  const { recognized, unmatched, skipped } = preview;

  // { itemKey: { productId, catalogName } } — in-memory only (not written to stock/transactions)
  const [manualResolutions, setManualResolutions] = useState({});

  function handleResolve(key, productId, catalogName, ejName) {
    // Save alias immediately so future EJ imports auto-recognize it
    storage.addAliasToProduct(productId, ejName.toLowerCase().trim());
    setManualResolutions(prev => ({ ...prev, [key]: { productId, catalogName } }));
  }

  function handleUnresolve(key) {
    // Remove from in-session staging (alias stays in localStorage — it's correct)
    setManualResolutions(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // ── Derived display data ──────────────────────────────────────────────────
  const manuallyResolved = unmatched
    .filter(u => manualResolutions[itemKey(u)])
    .map(u => ({
      ...u,
      status:      'recognized',
      catalogName: manualResolutions[itemKey(u)].catalogName,
      productId:   manualResolutions[itemKey(u)].productId,
      matchSource: 'manual',
      matchType:   'MANUAL',
      _key:        itemKey(u),
    }));

  const stillUnmatched = unmatched.filter(u => !manualResolutions[itemKey(u)]);
  const allRecognized  = [...recognized, ...manuallyResolved];

  // ── Stats ─────────────────────────────────────────────────────────────────
  const autoCount     = recognized.filter(r => r.matchType === 'AUTO').length;
  const reviewCount   = recognized.filter(r => r.matchType === 'NEEDS REVIEW').length;
  const manualCount   = manuallyResolved.length;
  const totalDetected = recognized.length + unmatched.length + skipped.length;
  const resolvedTotal = allRecognized.length;
  const nonSkipped    = totalDetected - skipped.length;
  const pct           = nonSkipped > 0 ? Math.round((resolvedTotal / nonSkipped) * 100) : 100;

  return (
    <div>
      {/* File name chip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        padding: '8px 12px',
        background: 'var(--bg3)',
        borderRadius: 8,
        border: '1px solid var(--border2)',
      }}>
        <span style={{ fontSize: 18 }}>📄</span>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName || 'fișier.json'}
        </span>
        <button
          onClick={onReset}
          style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text3)', cursor: 'pointer', flexShrink: 0 }}
        >
          ✕ Alt fișier
        </button>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text1)' }}>{totalDetected}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>total detectate</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '12px 8px', background: 'rgba(76,175,125,0.07)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{resolvedTotal}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>recunoscute</div>
        </div>
        <div className="card" style={{
          textAlign: 'center',
          padding: '12px 8px',
          background: stillUnmatched.length === 0 ? 'rgba(76,175,125,0.07)' : 'rgba(220,38,38,0.06)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: stillUnmatched.length === 0 ? 'var(--green)' : '#dc2626' }}>
            {stillUnmatched.length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>nerecunoscute</div>
        </div>
      </div>

      {/* Sub-stats badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <Badge
          text={`✔ ${autoCount} AUTO`}
          style={{ ...BADGE_STYLES.AUTO, fontSize: 11, padding: '3px 10px' }}
        />
        {reviewCount > 0 && (
          <Badge
            text={`⚠ ${reviewCount} NEEDS REVIEW`}
            style={{ ...BADGE_STYLES['NEEDS REVIEW'], fontSize: 11, padding: '3px 10px' }}
          />
        )}
        {manualCount > 0 && (
          <Badge
            text={`✎ ${manualCount} MANUAL`}
            style={{ ...BADGE_STYLES.MANUAL, fontSize: 11, padding: '3px 10px' }}
          />
        )}
        {skipped.length > 0 && (
          <Badge
            text={`✕ ${skipped.length} ignorate`}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text3)', fontSize: 11, padding: '3px 10px' }}
          />
        )}
      </div>

      {/* Progress bar */}
      {nonSkipped > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
            <span>Progres recunoaștere</span>
            <span>{pct}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: pct === 100 ? 'var(--green)' : '#6366f1',
              borderRadius: 99,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Recognized list (AUTO + NEEDS REVIEW + MANUAL combined) */}
      {allRecognized.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text1)', marginBottom: 10 }}>
            ✔ Recunoscute ({allRecognized.length})
            {manualCount > 0 && (
              <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: '#6366f1' }}>
                · {manualCount} mapate manual
              </span>
            )}
          </div>
          <RecognizedList items={allRecognized} onUnresolve={handleUnresolve} />
        </div>
      )}

      {/* Unmatched section — typeahead per row */}
      {unmatched.length > 0 && (
        <div className="card" style={{
          marginBottom: 12,
          borderColor: stillUnmatched.length === 0 ? 'rgba(76,175,125,0.4)' : 'rgba(220,38,38,0.3)',
        }}>
          <div style={{
            fontWeight: 700,
            fontSize: 14,
            color: stillUnmatched.length === 0 ? 'var(--green)' : '#dc2626',
            marginBottom: 10,
          }}>
            {stillUnmatched.length === 0
              ? '✔ Toate produsele au fost mapate'
              : `⚠ Nerecunoscute (${stillUnmatched.length})`}
          </div>
          {stillUnmatched.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 }}>
                Caută echivalentul din catalog. Aliasul se salvează automat pentru import-uri viitoare.
              </div>
              <UnmatchedSection items={stillUnmatched} onResolve={handleResolve} />
            </>
          )}
        </div>
      )}

      {/* Skipped list (collapsed by default) */}
      {skipped.length > 0 && (
        <details style={{ marginBottom: 16 }}>
          <summary style={{ fontSize: 13, color: 'var(--text3)', cursor: 'pointer', userSelect: 'none', padding: '6px 0' }}>
            ✕ Ignorate ({skipped.length}) — corecții bon / produse false
          </summary>
          <div className="card" style={{ marginTop: 8 }}>
            {skipped.map((item, i) => (
              <div key={i} style={{
                fontSize: 12,
                color: 'var(--text3)',
                padding: '4px 0',
                borderBottom: i < skipped.length - 1 ? '1px solid var(--border1)' : 'none',
              }}>
                <span style={{ fontFamily: 'monospace' }}>{item.ejName}</span>
                <span style={{ marginLeft: 8 }}>— {item.reason}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Confirm button — disabled until import logic is implemented */}
      <div style={{
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid #f59e0b',
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 20,
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#b45309', marginBottom: 6 }}>
          ⚠ Funcționalitate în pregătire
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          Importul efectiv nu este implementat încă. Stocul și tranzacțiile nu sunt modificate.
          {stillUnmatched.length > 0 && (
            <span style={{ color: '#dc2626' }}>
              {' '}Rezolvă mai întâi cele {stillUnmatched.length} produse nerecunoscute.
            </span>
          )}
        </div>
        <button
          className="btn btn-primary"
          disabled
          style={{ marginTop: 12, opacity: 0.45, cursor: 'not-allowed' }}
        >
          ✅ Confirmă import ({autoCount + reviewCount + manualCount} intrări recunoscute)
        </button>
      </div>
    </div>
  );
}
