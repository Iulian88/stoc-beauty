import { matchProduct, findProduct } from '../data/products.js';

const MAX_OCR_WIDTH = 1500;

/**
 * Comprimă o imagine la maxim MAX_OCR_WIDTH lățime folosind Canvas API.
 * Returnează un Blob JPEG (~200–400 KB), indiferent de dimensiunea originală.
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = img.width > MAX_OCR_WIDTH ? MAX_OCR_WIDTH / img.width : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/jpeg', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

// No-op — kept for backward compatibility with Upload.jsx useEffect cleanup
export function cleanupWorker() {}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function callOcrApi(imageFile, type, onProgress) {
  onProgress?.('Se comprimă imaginea...');
  const compressed = await compressImage(imageFile).catch(() => imageFile);
  onProgress?.('Se trimite la Claude Vision...');
  const imageBase64 = await blobToBase64(compressed);
  const res = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mediaType: 'image/jpeg', type }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.success === false) {
    const detail = data.detail ? ` (${data.claudeStatus}: ${data.detail.slice(0, 120)})` : '';
    throw new Error((data.error || 'Claude error') + detail);
  }
  return data;
}

export async function runClaudeOCR(imageFile, onProgress) {
  try {
    const { items, factura } = await callOcrApi(imageFile, 'invoice', onProgress);
    const count = (items || []).length;
    onProgress?.(`✓ ${count} produs${count !== 1 ? 'e' : ''} extras${count !== 1 ? 'e' : ''}!`);
    const results = [];
    for (const item of (items || [])) {
      console.log('[OCR PRICE]', item.nume, item.pret);
      const match = matchProduct(item.nume);
      if (match) {
        const { product, needsReview: matchNeedsReview } = match;
        const existing = results.find(r => r.productId === product.id);
        if (existing) {
          existing.cantitate += item.cantitate || 1;
        } else {
          results.push({
            productId: product.id,
            productName: product.name,
            cantitate: item.cantitate || 1,
            pretAchizitie: item.pret ?? product.pretAchizitie,
            pretAchizitieOcr: item.pret || null,
            pretAchiziitieCatalog: product.pretAchizitie,
            pretVanzare: product.pretVanzare,
            totalOcr: item.total_pret || null,
            sourceOcr: item.source || null,
            priceMismatch: item.price_mismatch || false,
            rawLine: item.nume,
            confidence: 'auto',
            needsReview: matchNeedsReview || false,
          });
        }
      } else {
        results.push({
          productId: null,
          productName: null,
          cantitate: item.cantitate || 1,
          pretAchizitie: item.pret || null,
          pretAchizitieOcr: item.pret || null,
          totalOcr: item.total_pret || null,
          sourceOcr: item.source || null,
          priceMismatch: item.price_mismatch || false,
          rawLine: item.nume,
          confidence: 'manual',
          needsReview: true,
        });
      }
    }
    return { success: true, items: results, factura: factura ?? null };
  } catch (error) {
    return { success: false, items: [], factura: null, error: error.message };
  }
}

export async function runClaudeZReport(imageFile, onProgress) {
  try {
    const { total } = await callOcrApi(imageFile, 'zreport', onProgress);
    return { success: true, total: total ?? null };
  } catch (error) {
    return { success: false, total: null, error: error.message };
  }
}




// parseOCRText removed — Claude Vision returns structured JSON directly
// Legacy stub kept so any stray import does not break at runtime
export function parseOCRText() { return []; }

// --- Z-report text parser (kept for fallback) ---
function _unused_parseOCRText_placeholder() {
  const lines = rawText.split('\n').filter(l => l.trim().length > 3);
  const results = [];

  for (const line of lines) {
    const cleaned = line.trim();
    
    // Try to extract quantity - look for patterns like "x5", "5 buc", "5x", "qty: 5", standalone numbers
    const qtyPatterns = [
      /[xX]\s*(\d+)/,
      /(\d+)\s*[xX]/,
      /(\d+)\s*buc/i,
      /cant[:\s]+(\d+)/i,
      /qty[:\s]+(\d+)/i,
      /(\d+)\s*$/,
      /^\s*(\d+)/,
    ];

    let cantitate = 1;
    let textFaraCantitate = cleaned;

    for (const pattern of qtyPatterns) {
      const match = cleaned.match(pattern);
      if (match) {
        const qty = parseInt(match[1]);
        if (qty > 0 && qty < 1000) {
          cantitate = qty;
          textFaraCantitate = cleaned.replace(match[0], '').trim();
          break;
        }
      }
    }

    // Skip lines that are just numbers or prices (e.g. totals)
    if (/^[\d\s.,RONron%+-]+$/.test(textFaraCantitate)) continue;
    if (textFaraCantitate.length < 4) continue;

    const product = findProduct(textFaraCantitate);
    
    if (product) {
      // Check for duplicates
      const existing = results.find(r => r.productId === product.id);
      if (existing) {
        existing.cantitate += cantitate;
      } else {
        results.push({
          productId: product.id,
          productName: product.name,
          cantitate,
          pretAchizitie: product.pretAchizitie,
          pretVanzare: product.pretVanzare,
          rawLine: cleaned,
          confidence: 'auto',
        });
      }
    } else {
      // Unknown product - flag for manual review
      results.push({
        productId: null,
        productName: null,
        cantitate,
        rawLine: cleaned,
        confidence: 'manual',
        needsReview: true,
      });
    }
  }

}

// Parser: extract total amount from a Z-report (fiscal end-of-day receipt)
export function parseZReportOCR(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // Patterns for Romanian fiscal printers
  const totalPatterns = [
    /total\s*general[:\s]+(\d+[,.]\d{2})/i,
    /total\s*incasat[:\s]+(\d+[,.]\d{2})/i,
    /total\s*zi[:\s]+(\d+[,.]\d{2})/i,
    /total[:\s]+(\d+[,.]\d{2})/i,
    /suma\s*totala[:\s]+(\d+[,.]\d{2})/i,
    /vanzari\s*totale[:\s]+(\d+[,.]\d{2})/i,
  ];

  const detected = extractTotalFromLines(lines, totalPatterns);
  if (detected !== null) return detected;

  // Fallback: largest number in the text (likely the total)
  const amountPattern = /(\d{1,6}[,.]\d{2})/g;
  const allAmounts = [];
  let m;
  while ((m = amountPattern.exec(rawText)) !== null) {
    const val = Number.parseFloat(m[1].replace(',', '.'));
    if (!Number.isNaN(val) && val > 0) allAmounts.push(val);
  }

  return allAmounts.length > 0 ? Math.max(...allAmounts) : null;
}

function extractTotalFromLines(lines, patterns) {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const value = Number.parseFloat(match[1].replace(',', '.'));
        if (!Number.isNaN(value) && value > 0) return value;
      }
    }
  }
  return null;
}
