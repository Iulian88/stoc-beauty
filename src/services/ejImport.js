/**
 * EJ Import matching engine — safe, read-only.
 *
 * Resolves POS journal items (vanzari_structurat.json format) to catalog
 * products using the three mapping layers. Writes NOTHING to storage.
 *
 * Input item shape:
 *   { name, qty, price, raw_context, ml_detected, is_correction, line }
 *
 * Output of processEJImport:
 *   { recognized: [...], unmatched: [...], skipped: [...] }
 */

import { PRODUCTS } from '../data/products';
import { EJ_LOW_RISK, EJ_MEDIUM, EJ_HIGH_PARTIAL, EJ_IGNORED } from '../data/ejMappings';

// Build catalog name (lowercase) → product lookup once at module load
const productByName = new Map(
  PRODUCTS.map(p => [p.name.toLowerCase(), p])
);

function findProductByCatalogName(catalogName) {
  return productByName.get(catalogName.toLowerCase()) ?? null;
}

/**
 * Match a single EJ sale record.
 * Returns one of:
 *   { status: 'skipped',    ejName, reason }
 *   { status: 'unmatched',  ejName, mlDetected, qty, price, rawContext, line, reason }
 *   { status: 'recognized', ejName, mlDetected, qty, price, rawContext, line,
 *                           catalogName, productId, matchSource, matchType, confidence? }
 *
 * matchType values:
 *   'AUTO'         — confirmed mapping, safe to import as-is
 *   'NEEDS REVIEW' — medium-confidence mapping, human should verify
 *
 * matchSource values:
 *   'mapping_high'   — HIGH RISK split rule
 *   'mapping_low'    — LOW RISK confirmed
 *   'mapping_medium' — MEDIUM RISK (high or medium confidence)
 *   'alias'          — product.aliases fallback
 */
function matchEJItem(item) {
  const ejName = (item.name ?? '').trim().toUpperCase();
  const ml = item.ml_detected ? item.ml_detected.toUpperCase() : null;

  // ── 1. Skip cashier corrections ─────────────────────────────────────────
  if (item.is_correction) {
    return { status: 'skipped', ejName, reason: 'corecție bon' };
  }

  // ── 2. Skip ignored names (PRODUSE etc.) ────────────────────────────────
  if (EJ_IGNORED.has(ejName)) {
    return { status: 'skipped', ejName, reason: 'nu este produs real (corecție casă)' };
  }

  const base = {
    ejName,
    mlDetected: ml,
    qty: item.qty ?? 1,
    price: item.price ?? null,
    rawContext: item.raw_context ?? '',
    line: item.line ?? null,
  };

  // ── 3. HIGH RISK split rules ─────────────────────────────────────────────
  const highRule = EJ_HIGH_PARTIAL[ejName];
  if (highRule?.splitByMl) {
    if (!ml) {
      return {
        ...base,
        status: 'unmatched',
        reason: 'split obligatoriu pe ml_detected — valoare lipsă, imposibil de diferențiat',
      };
    }
    const catalogName = highRule.splitByMl[ml];
    if (!catalogName) {
      return {
        ...base,
        status: 'unmatched',
        reason: `split pe ML: valoare necunoscută "${ml}"`,
      };
    }
    const prod = findProductByCatalogName(catalogName);
    return {
      ...base,
      status: 'recognized',
      catalogName,
      productId: prod?.id ?? null,
      matchSource: 'mapping_high',
      matchType: 'AUTO',
    };
  }

  // ── 4. LOW RISK exact mapping ────────────────────────────────────────────
  const lowMatch = EJ_LOW_RISK[ejName];
  if (lowMatch) {
    const prod = findProductByCatalogName(lowMatch);
    return {
      ...base,
      status: 'recognized',
      catalogName: lowMatch,
      productId: prod?.id ?? null,
      matchSource: 'mapping_low',
      matchType: 'AUTO',
    };
  }

  // ── 5. MEDIUM RISK mapping ───────────────────────────────────────────────
  const medEntry = EJ_MEDIUM[ejName];
  if (medEntry) {
    if (!medEntry.propunere) {
      // Low confidence with no proposal — treat as unmatched
      return {
        ...base,
        status: 'unmatched',
        reason: 'exclus — absent din catalog sau dubiu nerezolvat',
      };
    }
    const prod = findProductByCatalogName(medEntry.propunere);
    const matchType = medEntry.confidence === 'high' ? 'AUTO' : 'NEEDS REVIEW';
    return {
      ...base,
      status: 'recognized',
      catalogName: medEntry.propunere,
      productId: prod?.id ?? null,
      matchSource: 'mapping_medium',
      matchType,
      confidence: medEntry.confidence,
    };
  }

  // ── 6. Alias fallback (static catalog + learned localStorage aliases) ────
  const ejLower = ejName.toLowerCase();

  // 6a. Static aliases from products.js
  for (const prod of PRODUCTS) {
    for (const alias of (prod.aliases ?? [])) {
      if (ejLower.includes(alias) || alias.includes(ejLower)) {
        return {
          ...base,
          status: 'recognized',
          catalogName: prod.name,
          productId: prod.id,
          matchSource: 'alias',
          matchType: 'AUTO',
        };
      }
    }
  }

  // 6b. Learned aliases from localStorage (stoc_learned_aliases)
  let learnedAliases = {};
  try {
    learnedAliases = JSON.parse(localStorage.getItem('stoc_learned_aliases') || '{}');
  } catch { /* ignore */ }
  for (const [productId, aliases] of Object.entries(learnedAliases)) {
    if ((aliases ?? []).some(a => ejLower === a || ejLower.includes(a) || a.includes(ejLower))) {
      const prod = PRODUCTS.find(p => String(p.id) === String(productId));
      if (prod) {
        return {
          ...base,
          status: 'recognized',
          catalogName: prod.name,
          productId: prod.id,
          matchSource: 'alias',
          matchType: 'AUTO',
        };
      }
    }
  }

  // ── 7. No match ──────────────────────────────────────────────────────────
  return {
    ...base,
    status: 'unmatched',
    reason: 'fără mapping confirmat — produs HIGH RISK nerezolvat sau necunoscut',
  };
}

/**
 * Process an array of EJ sale records.
 *
 * @param {Array} items - Parsed JSON array in vanzari_structurat.json format
 * @returns {{ recognized: Array, unmatched: Array, skipped: Array }}
 *
 * IMPORTANT: This function is read-only. It does NOT write to localStorage,
 * storage, or any React state. The caller is responsible for confirming import.
 */
export function processEJImport(items) {
  if (!Array.isArray(items)) {
    throw new Error('Input trebuie să fie un array JSON (vanzari_structurat.json).');
  }

  const recognized = [];
  const unmatched  = [];
  const skipped    = [];

  for (const item of items) {
    const result = matchEJItem(item);
    if (result.status === 'recognized') recognized.push(result);
    else if (result.status === 'unmatched') unmatched.push(result);
    else skipped.push(result);
  }

  return { recognized, unmatched, skipped };
}
