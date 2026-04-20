/*
 * LISTA PREȚURI MAGAZIN — SOURCE OF TRUTH pentru prețuri de vânzare.
 * ───────────────────────────────────────────────────────────────────────────
 *   ✔ pretVanzare   — prețul de vânzare (autoritar, folosit în toate calculele)
 *                     null = produs fără preț listat (accesorii/pompe/neconfirmat)
 *   ✖ pretAchizitie — ELIMINAT din catalog. Costul real vine EXCLUSIV din
 *                     factură (OCR) → stocat ca item.pretAchizitie în tranzacție.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const PRODUCTS = [
  // ── Color Radiance ───────────────────────────────────────────────────────
  { id: 1,  name: "Color Radiance Conditioner 1000ml",      pretVanzare: 95,    aliases: ["color radiance conditioner 1000", "cond color radiance 1000", "lcare color radiance conditioner 1000"] },
  { id: 2,  name: "Color Radiance Conditioner Spray 250ml", pretVanzare: 55,    aliases: ["color radiance conditioner spray", "cond spray color radiance", "color radiance spray 250"] },
  { id: 3,  name: "Color Radiance Shampoo 1000ml",          pretVanzare: 85,    aliases: ["color radiance sampon 1000", "color radiance shampoo 1000", "lcare color radiance 1000"] },
  { id: 4,  name: "Color Radiance Shampoo 250ml",           pretVanzare: 45,    aliases: ["color radiance sampon 250", "color radiance shampoo 250"] },

  // ── Curl Definer ─────────────────────────────────────────────────────────
  { id: 5,  name: "Curl Definer Shampoo 250ml",             pretVanzare: 50,    aliases: ["curl definer sampon", "curl definer shampoo", "curl definer shampoo 250"] },

  // ── Fiber Infusion ───────────────────────────────────────────────────────
  { id: 6,  name: "Fiber Infusion Shampoo 250ml",           pretVanzare: 50,    aliases: ["fiber infusion sampon 250", "fiber infusion shampoo 250"] },
  { id: 7,  name: "Fiber Infusion Shampoo 1000ml",          pretVanzare: 95,    aliases: ["fiber infusion sampon 1000", "sampon fiber infusion 1000", "fiber infusion 1000", "fiber infusion shampoo 1000"] },
  { id: 8,  name: "Fiber Infusion Tratament 200ml",         pretVanzare: 70,    aliases: ["fiber infusion trat 200", "fiber infusion masca 200", "trat fiber infusion 200"] },
  { id: 9,  name: "Fiber Infusion Tratament 750ml",         pretVanzare: 145,   aliases: ["fiber infusion trat 750", "fiber infusion masca 750", "fiber infusion tratament 750"] },
  { id: 10, name: "Fiber Infusion Tratament 5min 100ml",    pretVanzare: 65,    aliases: ["fiber infusion 5 min", "trat fiber infusion 5min", "fiber 5 minute", "fiber infusion 5min 100"] },

  // ── Impressive Volume ────────────────────────────────────────────────────
  { id: 11, name: "Impressive Volume Shampoo 1000ml",       pretVanzare: 85,    aliases: ["impresive volume sampon 1000", "impressive volume 1000", "impresive volum 1000", "impressive volume shampoo 1000"] },
  { id: 12, name: "Impressive Volume Shampoo 250ml",        pretVanzare: 45,    aliases: ["impresive volum 250", "impressive volume 250", "impressive volume shampoo 250"] },

  // ── Intensive Cleanser ───────────────────────────────────────────────────
  { id: 13, name: "Intensive Cleanser Shampoo 1000ml",      pretVanzare: 85,    aliases: ["intensive cleanser 1000", "intensive cleanser sampon", "intensive cleanser shampoo 1000"] },

  // ── Velvet Oil ───────────────────────────────────────────────────────────
  { id: 14, name: "Velvet Oil 30ml",                        pretVanzare: 45,    aliases: ["velvet oil 30", "ulei velvet 30", "lcare velvet oil mini", "velvet oil 30 ml"] },
  { id: 15, name: "Velvet Oil 100ml",                       pretVanzare: 85,    aliases: ["velvet oil 100", "ulei velvet 100", "velvet oil 100 ml"] },
  { id: 16, name: "Velvet Oil Shampoo 1000ml",              pretVanzare: 95,    aliases: ["velvet oil sampon 1000", "velvet oil shampoo 1000"] },
  { id: 17, name: "Velvet Oil Shampoo 250ml",               pretVanzare: 50,    aliases: ["velvet oil sampon 250", "velvet oil shampoo 250"] },
  { id: 18, name: "Velvet Oil Tratament 200ml",             pretVanzare: 70,    aliases: ["velvet oil trat 200", "velvet oil masca 200", "velvet oil tratament 200"] },
  { id: 19, name: "Velvet Oil Tratament 750ml",             pretVanzare: 145,   aliases: ["velvet oil trat 750", "velvet oil masca 750", "velvet oil tratament 750"] },

  // ── Visible Repair ───────────────────────────────────────────────────────
  { id: 20, name: "Visible Repair Shampoo 1000ml",          pretVanzare: 85,    aliases: ["visible repair sampon 1000", "visible repair shampoo 1000"] },
  { id: 21, name: "Visible Repair Shampoo 250ml",           pretVanzare: 45,    aliases: ["visible repair sampon 250", "visible repair shampoo 250"] },
  { id: 22, name: "Visible Repair Tratament 200ml",         pretVanzare: 70,    aliases: ["visible repair trat 200", "visible repair masca 200", "visible repair tratament 200"] },
  { id: 23, name: "Visible Repair Tratament 750ml",         pretVanzare: 120,   aliases: ["visible repair trat 750", "visible repair masca 750", "visible repair tratament 750"] },

  // ── Vital Booster ────────────────────────────────────────────────────────
  { id: 24, name: "Vital Booster Serum 6x9ml",              pretVanzare: 90,    aliases: ["vital booster serum", "vital booster ser", "vital booster 6x9", "vital ser 6x9"] },
  { id: 25, name: "Vital Booster Shampoo 1000ml",           pretVanzare: 85,    aliases: ["vital booster sampon 1000", "vital booster shampoo 1000"] },
  { id: 26, name: "Vital Booster Shampoo 250ml",            pretVanzare: 45,    aliases: ["vital booster sampon 250", "vital booster shampoo 250"] },

  // ── Styling ──────────────────────────────────────────────────────────────
  { id: 27, name: "Coil Up Cream 200ml",                    pretVanzare: 60,    aliases: ["coil up cream", "coil up", "coil up cream 200"] },
  { id: 28, name: "Fixativ Lock It 500ml",                  pretVanzare: 60,    aliases: ["lock it 500", "fixativ lock it 500", "lock it fixativ 500"] },
  { id: 29, name: "Fixativ Lock It 300ml",                  pretVanzare: 50,    aliases: ["lock it 300", "fixativ lock it 300"] },
  { id: 30, name: "Spray Protect It 150ml",                 pretVanzare: 50,    aliases: ["protect it 150", "spray protect it", "protect it spray"] },
  { id: 31, name: "Shift It Mud Ceara 75ml",                pretVanzare: 40,    aliases: ["shift it mud", "shift it ceara", "ceara shift it"] },
  { id: 32, name: "Stimulating Tonic 150ml",                pretVanzare: 55,    aliases: ["stimulating tonic", "tonic stimulating", "stimulating tonic 150"] },
  { id: 38, name: "Spuma Dramatize 500ml",                  pretVanzare: 60,    aliases: ["spuma dramatize", "dramatize spuma", "dramatize 500"] },
  { id: 47, name: "Solidify Gel 100ml",                     pretVanzare: 45,    aliases: ["solidify gel", "gel solidify", "solidify gel 100"] },
  { id: 48, name: "Lift It Mousse Root 250ml",              pretVanzare: 65,    aliases: ["lift it mousse", "mousse lift it", "lift it root", "lift it mousse 250"] },
  { id: 50, name: "Fiber Gum Ceara 75ml",                   pretVanzare: 45,    aliases: ["fiber gum", "ceara fiber gum", "fiber gum ceara"] },

  // ── Anti-Dandruff / Scalp ────────────────────────────────────────────────
  { id: 33, name: "Shampoo Anti-Dandruff 250ml",            pretVanzare: 45,    aliases: ["anti dandruf sampon", "anti dandruff shampoo", "sampon matreata", "anti dandruff 250"] },

  // ── Pachete Promo ────────────────────────────────────────────────────────
  { id: 34, name: "Pachet Promo Fiber 1750ml",              pretVanzare: 216,   aliases: ["pachet fiber", "promo fiber", "set fiber", "pachet promo fiber"] },
  { id: 35, name: "Pachet Promo Visible 1750ml",            pretVanzare: 184.5, aliases: ["pachet visible", "promo visible", "set visible", "pachet promo visible"] },
  { id: 36, name: "Pachet Promo Visible+Ulei 1850ml",       pretVanzare: 261,   aliases: ["pachet visible ulei", "promo visible ulei", "pachet promo visible ulei"] },
  { id: 37, name: "Pachet Promo Color Radiance 2000ml",     pretVanzare: 162,   aliases: ["pachet color radiance", "promo color radiance", "pachet promo color radiance"] },

  // ── Fanola ───────────────────────────────────────────────────────────────
  { id: 39, name: "Fanola No Yellow Shampoo 1000ml",        pretVanzare: 95,    aliases: ["fanola no yellow 1000", "no yellow sampon 1000", "no yellow 1000", "shampoo no yellow 1000"] },
  { id: 40, name: "Fanola No Yellow Shampoo 350ml",         pretVanzare: 65,    aliases: ["fanola no yellow 350", "no yellow sampon 350", "no yellow 350", "shampoo no yellow 350"] },
  { id: 46, name: "Fanola No Orange Shampoo",               pretVanzare: 95,    aliases: ["fanola no orange", "no orange sampon", "no orange", "fanola no orange shampoo"] },

  // ── P.U.R.E ──────────────────────────────────────────────────────────────
  { id: 41, name: "P.U.R.E Sampon 1000ml",                  pretVanzare: 90,    aliases: ["pure sampon 1000", "pure shampoo 1000", "p.u.r.e sampon"] },
  { id: 42, name: "P.U.R.E Masca 750ml",                    pretVanzare: 145,   aliases: ["pure masca 750", "pure tratament 750", "p.u.r.e masca 750"] },
  { id: 43, name: "P.U.R.E Masca 200ml",                    pretVanzare: 70,    aliases: ["pure masca 200", "p.u.r.e masca 200"] },

  // ── CALM ─────────────────────────────────────────────────────────────────
  { id: 44, name: "CALM Shampoo 1000ml",                    pretVanzare: 90,    aliases: ["calm sampon 1000", "calm shampoo 1000"] },
  { id: 45, name: "CALM Shampoo 250ml",                     pretVanzare: 50,    aliases: ["calm sampon 250", "calm shampoo 250"] },

  // ── Oils ─────────────────────────────────────────────────────────────────
  { id: 49, name: "Luxe Oil Wella 30ml",                    pretVanzare: null,  aliases: ["luxeoil wella", "luxe oil wella", "wella luxeoil", "luxe oil 30"] },

  // ── Sleek Smoother ───────────────────────────────────────────────────────
  { id: 51, name: "Masca Sleek Smoother 200ml",             pretVanzare: 70,    aliases: ["sleek smoother 200", "sleek smother 200", "masca sleek 200"] },
  { id: 52, name: "Masca Sleek Smoother 750ml",             pretVanzare: 55,    aliases: ["sleek smoother 750", "sleek smother 750", "masca sleek 750"] },

  // ── Curl / Live In ───────────────────────────────────────────────────────
  { id: 53, name: "Live In Curl Definer",                   pretVanzare: 60,    aliases: ["live in curl", "curl definer live in", "live in curl definer"] },

  // ── Accesorii / fără preț listat ─────────────────────────────────────────
  { id: 54, name: "Pompa Sampon 1000ml",                    pretVanzare: null,  aliases: ["pompa sampon", "pump sampon"] },
  { id: 55, name: "Pompa Masca 750ml",                      pretVanzare: null,  aliases: ["pompa masca", "pump masca"] },

  // ── Serumuri ─────────────────────────────────────────────────────────────
  { id: 56, name: "Visible Repair Serum 6x9ml",             pretVanzare: null,  aliases: ["visible repair serum", "visible repair ser", "visible repair 6x9", "visible repair serum 6x9", "visible serum"] },

  // ── TonPlex ──────────────────────────────────────────────────────────────
  { id: 57, name: "Ton Plex Sampon Pearl 250ml",            pretVanzare: 50,    aliases: ["ton plex pearl", "tonplex sampon pearl", "ton plex sampon 250", "ton plex pearl 250", "tonplex pearl"] },
];

// ─── Feature extraction ────────────────────────────────────────────────────

const PRODUCT_TYPES = {
  shampoo:     ['shampoo', 'sampon'],
  conditioner: ['conditioner'],
  tratament:   ['tratament', 'masca', 'mask', 'treatment'],
  serum:       ['serum', 'ser'],
  oil:         ['velvet oil', 'luxe oil', 'ulei'],
  spray:       ['spray'],
  fixativ:     ['fixativ', 'lock it'],
  ceara:       ['ceara', 'mud', 'gel'],
  mousse:      ['mousse', 'spuma'],
  cream:       ['cream', 'crema'],
  tonic:       ['tonic'],
  pompa:       ['pompa', 'pump'],
  pachet:      ['pachet', 'promo', 'set'],
};

const STOP_WORDS = new Set(['and', 'the', 'for', 'buc', 'ron', 'pret', 'with']);

function normalizeText(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Extract volume token: "250ml", "1000ml", "6x9ml", "750 ml" → "250ml"
function extractVolume(normalized) {
  const m = normalized.match(/(\d+\s*x\s*\d+\s*ml|\d+\s*ml)/);
  return m ? m[0].replace(/\s/g, '') : null;
}

// Detect product type (first match wins — ordered from most specific to least)
function extractType(normalized) {
  for (const [type, keywords] of Object.entries(PRODUCT_TYPES)) {
    if (keywords.some(k => normalized.includes(k))) return type;
  }
  return null;
}

// Meaningful words: length > 2, not a stop word, not a pure number, not "ml"
function extractKeywords(normalized) {
  return normalized.split(' ').filter(w =>
    w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w) && w !== 'ml'
  );
}

function extractFeatures(text) {
  const normalized = normalizeText(text);
  return {
    normalized,
    volume: extractVolume(normalized),
    productType: extractType(normalized),
    keywords: extractKeywords(normalized),
  };
}

// Pre-build features for every catalog product (name + all aliases merged)
const PRODUCT_FEATURES = PRODUCTS.map(p =>
  extractFeatures(p.name + ' ' + p.aliases.join(' '))
);

// ─── Scoring ───────────────────────────────────────────────────────────────

function scoreCandidate(input, productIdx) {
  const pf = PRODUCT_FEATURES[productIdx];
  let score = 0;
  const reasons = [];

  // Volume — HARD RULE: mismatch → hard reject
  if (input.volume && pf.volume) {
    if (input.volume === pf.volume) {
      score += 3;
      reasons.push(`volume match +3 (${input.volume})`);
    } else {
      // Hard reject — return sentinel score so caller can skip
      return { score: -99, reasons: [`HARD REJECT: volume ${input.volume} ≠ ${pf.volume}`] };
    }
  }

  // Product type
  if (input.productType && pf.productType) {
    if (input.productType === pf.productType) {
      score += 2;
      reasons.push(`type match +2 (${input.productType})`);
    } else {
      score -= 2;
      reasons.push(`type mismatch -2 (${input.productType} vs ${pf.productType})`);
    }
  }

  // Keyword overlap (+1 per shared keyword, deduplicated to avoid alias inflation)
  const inputSet = new Set(input.keywords);
  const overlap = [...new Set(pf.keywords)].filter(w => inputSet.has(w));
  if (overlap.length > 0) {
    score += overlap.length;
    reasons.push(`keyword overlap +${overlap.length}: [${overlap.join(', ')}]`);
  }

  return { score, reasons };
}

// ─── Main match function ────────────────────────────────────────────────────

/**
 * Returns { product, score, needsReview, reason } or null.
 * needsReview = true when the top two candidates are too close (score diff < 2).
 */
export function matchProduct(text) {
  if (!text) return null;

  const input = extractFeatures(text);

  // First pass: check exact alias match
  for (const product of PRODUCTS) {
    for (const alias of product.aliases) {
      if (input.normalized.includes(normalizeText(alias))) {
        console.log('[PRODUCT MATCH]', JSON.stringify({ ocr: text, matched: product.name, score: 10, alias_matched: true, needs_review: false, reason: 'exact alias' }));
        return { product, score: 10, needsReview: false, reason: 'exact alias', aliasMatched: true };
      }
    }
  }

  // Second pass: score all candidates
  const scored = PRODUCTS.map((product, idx) => {
    const { score, reasons } = scoreCandidate(input, idx);
    return { product, score, reasons };
  }).filter(c => c.score > -99 && c.score >= 2); // minimum score of 2 to qualify

  if (scored.length === 0) {
    console.log('[PRODUCT MATCH] NO MATCH:', text, '| volume:', input.volume, '| type:', input.productType, '| keywords:', input.keywords.join(', '));
    return null;
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];

  // Ambiguity: top two are within 1 point of each other
  const needsReview = second != null && (best.score - second.score) < 2;

  console.log('[PRODUCT MATCH]', JSON.stringify({
    ocr: text,
    matched: best.product.name,
    score: best.score,
    reasons: best.reasons,
    runner_up: second ? `${second.product.name} (score ${second.score})` : null,
    needs_review: needsReview,
    alias_matched: false,
  }));

  return { product: best.product, score: best.score, needsReview, reason: best.reasons.join('; '), aliasMatched: false };
}

// Backward-compatible wrapper — returns just the product or null
export function findProduct(text) {
  const result = matchProduct(text);
  return result ? result.product : null;
}
