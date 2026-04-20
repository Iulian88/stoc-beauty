/**
 * EJ Mapping tables — derived from the analysis pipeline on 5000722787.JE
 * (430 receipts, Jan 2022 – Apr 2026).
 *
 * Used EXCLUSIVELY for import preview.
 * No stock/transaction data is written until the user explicitly confirms.
 */

// ── LOW RISK: direct EJ name → catalog product name ───────────────────────
// 20 confirmed entries. Source: mapping_low_risk.json
export const EJ_LOW_RISK = {
  'VELVET OIL LIGHTWEIGHT 30ML':       'Velvet Oil 30ml',
  'SAMPON INTENSIVE CLEANSER 1000ML':  'Intensive Cleanser Shampoo 1000ml',
  'SAMPON VITAL BOOSTER 250ML':        'Vital Booster Shampoo 250ml',
  'CREMA BUCLE COIL UP 200ML':         'Coil Up Cream 200ml',
  'SMPON COLOR RADIANCE 1000ML':       'Color Radiance Shampoo 1000ml',
  'FIXATIV LOCK IT 500ML':             'Fixativ Lock It 500ml',
  'SAMPON IMPRESIVE VOLUME 1000ML':    'Impressive Volume Shampoo 1000ml',
  'TRATAMENT FIBER INFUSION 750ML':    'Fiber Infusion Tratament 750ml',
  'TRATAMENT FIBER INFUSION 200ML':    'Fiber Infusion Tratament 200ml',
  'FIXATIV LOCK IT 300ML':             'Fixativ Lock It 300ml',
  'VELVET OIL LIGHTWEIGHT 100ML':      'Velvet Oil 100ml',
  'TRATAMENT VISIBLE REPAIR 750ML':    'Visible Repair Tratament 750ml',
  'SAMPON VELVET OIL 1000ML':          'Velvet Oil Shampoo 1000ml',
  'CEARA DE PAR MEN SHIFT 75ML':       'Shift It Mud Ceara 75ml',
  'SAMPON VELVET OIL 250ML':           'Velvet Oil Shampoo 250ml',
  'CONDITIONER COLOR RADIANCE 250ML':  'Color Radiance Conditioner Spray 250ml',
  'TRATAMENT VELVET OIL 750ML':        'Velvet Oil Tratament 750ml',
  'PACHET PROMO RADIANCE 2000ML':      'Pachet Promo Color Radiance 2000ml',
  'SAMPON VISIBLE REPAIR 250ML':       'Visible Repair Shampoo 250ml',
  'SPUMA DRAMATIZE IT 500ML':          'Spuma Dramatize 500ml',
};

// ── MEDIUM RISK: EJ name → { propunere, confidence } ──────────────────────
// confidence 'high'   → auto-matched (shown as AUTO)
// confidence 'medium' → matched but flagged NEEDS REVIEW
// confidence 'low'    → not auto-matched
// Source: mapping_medium_propuneri.json
export const EJ_MEDIUM = {
  'SMPON ANTI-DANDRUF 250ML':      { propunere: 'Shampoo Anti-Dandruff 250ml',           confidence: 'high'   },
  'SAMPON VITAL BOOSTER 1000ML':   { propunere: 'Vital Booster Shampoo 1000ml',          confidence: 'high'   },
  'SAMPON IMPRESIVE VOLUME 250ML': { propunere: 'Impressive Volume Shampoo 250ml',        confidence: 'high'   },
  'SAMPON CURL DEFINER 250ML':     { propunere: 'Curl Definer Shampoo 250ml',             confidence: 'high'   },
  'SAMPON FIBER INFUSION 250ML':   { propunere: 'Fiber Infusion Shampoo 250ml',           confidence: 'high'   },
  'PACHET PROMO FIBER 1750ML':     { propunere: 'Pachet Promo Fiber 1750ml',              confidence: 'high'   },
  'TRATAMENT VELVET OIL 200ML':    { propunere: 'Velvet Oil Tratament 200ml',             confidence: 'high'   },
  'PACHET PROMO VISIBLE 1750ML':   { propunere: 'Pachet Promo Visible 1750ml',            confidence: 'high'   },
  'CONDITIONER COLOR RADIANCE':    { propunere: 'Color Radiance Conditioner 1000ml',      confidence: 'high'   },
  'SERUM VISIBLE REPAIR 6X9ML':    { propunere: 'Visible Repair Serum 6x9ml',             confidence: 'high'   },
  'MASCA PURE':                    { propunere: 'P.U.R.E Masca 750ml',                    confidence: 'high'   },
  'MASCA SLEEK SMOTHER':           { propunere: 'Masca Sleek Smoother 200ml',             confidence: 'high'   },
  // medium confidence — flagged for review
  'SAMPON FIBER INFUSION 1000ML':  { propunere: 'Fiber Infusion Shampoo 1000ml',          confidence: 'medium' },
  'SAMPON PURE':                   { propunere: 'P.U.R.E Sampon 1000ml',                  confidence: 'medium' },
  'TRATAMENT 5 MINUTE':            { propunere: 'Fiber Infusion Tratament 5min 100ml',    confidence: 'medium' },
  'LIVE IN CURL DEFINER':          { propunere: 'Live In Curl Definer',                   confidence: 'medium' },
  'STIMULATOR TONIC':              { propunere: 'Stimulating Tonic 150ml',                confidence: 'medium' },
  // low confidence / excluded — no auto-match
  'SAMPON TON PLEX':               { propunere: 'Ton Plex Sampon Pearl 250ml',            confidence: 'low'    },
  'WELLA ULEI PAR':                { propunere: null,                                     confidence: 'low'    },
  'GEL LOMNDA':                    { propunere: null,                                     confidence: 'low'    },
  'GLAM MIST WELLA':               { propunere: null,                                     confidence: 'low'    },
};

// ── HIGH RISK: split rules for ambiguous names ────────────────────────────
// Source: mapping_high_partial.json
// splitByMl: ml_detected value → catalog product name
export const EJ_HIGH_PARTIAL = {
  'SAMPON FANOLA': {
    splitByMl: {
      '1000ML': 'Fanola No Yellow Shampoo 1000ml',
      '350ML':  'Fanola No Yellow Shampoo 350ml',
    },
  },
};

// ── EJ names that are never real products ─────────────────────────────────
// PRODUSE: cashier correction artifact (price 1.84 RON, not a real product)
export const EJ_IGNORED = new Set(['PRODUSE']);
