// OCR Service - uses Tesseract.js (browser-based, free)
// Extensible: swap runOCR() implementation for Google Vision / Claude Vision later

const MAX_OCR_WIDTH = 1500; // px — suficient pentru Tesseract, reduce dimensiunea fișierului

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

let tesseractWorker = null;

async function getWorker() {
  if (tesseractWorker) return tesseractWorker;
  
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('ron+eng', 1, {
    logger: () => {}, // suppress logs
  });
  tesseractWorker = worker;
  return worker;
}

export async function cleanupWorker() {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}
export async function runOCR(imageFile, onProgress) {
  try {
    onProgress?.('Se inițializează OCR...');
    const worker = await getWorker();
    
    onProgress?.('Se procesează imaginea...');
    const { data } = await worker.recognize(imageFile);
    
    onProgress?.('Text extras cu succes!');
    return { success: true, text: data.text, confidence: data.confidence };
  } catch (error) {
    console.error('OCR error:', error);
    return { success: false, text: '', error: error.message };
  }
}

export async function runOCRFromUrl(url, onProgress) {
  try {
    onProgress?.('Se inițializează OCR...');
    const worker = await getWorker();
    onProgress?.('Se procesează imaginea...');
    const { data } = await worker.recognize(url);
    return { success: true, text: data.text, confidence: data.confidence };
  } catch (error) {
    return { success: false, text: '', error: error.message };
  }
}

// Parser: extract product lines from OCR text
import { findProduct } from '../data/products.js';

export function parseOCRText(rawText, documentType = 'factura') {
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

  return results.filter(r => r.rawLine.length > 3);
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
