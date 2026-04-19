// ── JSON extraction helpers ────────────────────────────────────────────────
function extractJSON(text) {
  // 1. Prefer content inside ```json ... ``` fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1];
  // 2. Greedy { … } fallback
  const objMatch = text.match(/\{[\s\S]*\}/);
  return objMatch ? objMatch[0] : null;
}
function repairJSON(s) {
  // Remove trailing commas before } or ]
  return s.replace(/,\s*([}\]])/g, '$1');
}
// ─────────────────────────────────────────────────────────────────────────────

const INVOICE_PROMPT = `You are an OCR + invoice parser.

CRITICAL OUTPUT RULE:
* Output MUST be valid JSON
* NO markdown
* NO explanations
* JSON.parse() must work directly

---

GOAL: Extract product lines with line number, name, and quantity ONLY.

---

LINE NUMBER RULES:
1. Extract from the LEFTMOST column labeled "Nr.", "No.", "Poz.", or similar
2. line_number MUST be an integer (1, 2, 3, ...)
3. Convert "1." → 1, "03" → 3
4. DO NOT confuse with product codes, barcodes, or SKUs
5. If missing → "line_number": null

---

QUANTITY RULES:
* Extract EXACT quantity from "Cant." column
* If quantity is missing or unclear → use 1

---

STRICT RULES:
* IGNORE ALL PRICE COLUMNS (Pret lista, Pret dupa rabat, Rabat, Valoare, TVA)
* IGNORE TOTALS
* IGNORE DISCOUNTS
* Keep product names EXACTLY as printed
* Include ONLY real product/service rows (no subtotals, VAT rows, summaries)
* DO NOT merge lines

---

OUTPUT FORMAT (return exactly this structure):

{
  "invoice": {
    "number": "",
    "date": "",
    "supplier": ""
  },
  "lines": [
    {
      "line_number": 1,
      "name": "LCARE Color Radiance Shampoo 1000 ml",
      "quantity": 4
    }
  ]
}
`;

const ZREPORT_PROMPT = `This is a Z-report (fiscal end-of-day receipt).
Extract ONLY the grand total sales amount in RON.
Return STRICT JSON: { "total": number }
If not found, return: { "total": null }`;

export default async function handler(req, res) {
  console.log('START OCR');
  console.log('Method:', req.method);
  console.log('Has API key:', !!process.env.CLAUDE_API_KEY);

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { imageBase64, mediaType = 'image/jpeg', type = 'invoice' } = req.body ?? {};

    console.log('Type:', type);
    console.log('Image base64 length:', imageBase64?.length ?? 0);
    console.log('Media type:', mediaType);

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      console.error('CLAUDE_API_KEY is not set');
      return res.status(500).json({ error: 'Claude API key not configured' });
    }

    const model = 'claude-haiku-4-5';
    const prompt = type === 'zreport' ? ZREPORT_PROMPT : INVOICE_PROMPT;
    console.log('Model:', model);
    console.log('Request base64 size (bytes):', Buffer.byteLength(imageBase64, 'utf8'));

    let claudeRes;
    try {
      claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: imageBase64,
                  },
                },
                {
                  type: 'text',
                  text: prompt,
                },
              ],
            },
          ],
        }),
      });
    } catch (err) {
      console.error('Network error calling Claude:', err.message);
      return res.status(502).json({ error: 'Network error calling Claude', detail: err.message });
    }

    console.log('Claude response status:', claudeRes.status);

    if (!claudeRes.ok) {
      let errBody = '';
      try { errBody = await claudeRes.text(); } catch {}
      console.error('Claude API error - status:', claudeRes.status, '- body:', errBody);
      // Always return 200 so the browser/service-worker never caches a 4xx for this route.
      // The error details are in the JSON body.
      return res.status(200).json({
        success: false,
        error: 'Claude API error',
        claudeStatus: claudeRes.status,
        detail: errBody,
      });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text ?? '';
    const stopReason = claudeData.stop_reason ?? 'unknown';
    console.log('CLAUDE RAW RESPONSE (first 1000):', text.slice(0, 1000));
    console.log('CLAUDE STOP REASON:', stopReason);
    if (stopReason === 'max_tokens') {
      console.error('WARNING: Claude response was TRUNCATED — increase max_tokens or shorten prompt');
    }

    // --- Z-report ---
    if (type === 'zreport') {
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) return res.status(200).json({ total: null });
      let parsed;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        console.error('Invalid JSON from Claude (zreport):', jsonMatch[0]);
        return res.status(200).json({ total: null, raw: text });
      }
      return res.status(200).json({ total: typeof parsed.total === 'number' ? parsed.total : null });
    }

    // --- Invoice: parse Claude response ---
    const rawJson = extractJSON(text);
    if (!rawJson) {
      console.error('No JSON object found in Claude response:', text.slice(0, 300));
      return res.status(200).json({ success: false, error: 'No JSON in Claude response', factura: null, items: [], raw: text });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      // Try basic repair (trailing commas, etc.)
      try {
        parsed = JSON.parse(repairJSON(rawJson));
        console.log('JSON parsed after repair');
      } catch {
        console.error('Invalid JSON from Claude (invoice):', rawJson.slice(0, 500));
        return res.status(200).json({ success: false, error: 'Invalid JSON from Claude', factura: null, items: [], raw: text });
      }
    }

    console.log('CLAUDE PARSED:', JSON.stringify(parsed, null, 2).slice(0, 1000));

    // Fallback safety — Claude returned no line data at all
    if (!parsed.lines && !parsed.items) {
      console.error('NO LINES/ITEMS IN CLAUDE RESPONSE');
      console.log('RAW PARSED DATA:', JSON.stringify(parsed));
      return res.status(200).json({
        success: false,
        error: 'No lines returned from OCR',
        factura: null,
        items: [],
        raw: parsed,
      });
    }

    // Support both new schema { invoice: {}, lines: [] } and legacy flat schema
    const inv = parsed.invoice ?? parsed;

    // Map Claude schema to frontend schema
    const factura = {
      numar: inv.number || '',
      data: inv.date || '',
      furnizor: inv.supplier || '',
    };

    const rawLines = Array.isArray(parsed.lines) ? parsed.lines
      : Array.isArray(parsed.items) ? parsed.items : [];
    console.log('[OCR RAW COUNT]', rawLines.length);

    const items = rawLines
      // Accept item if name or raw contains something useful
      .filter(item => {
        if (!item) return false;
        const n = (item.name || '').trim();
        const r = (item.raw || '').trim();
        return n.length > 0 || r.length > 0;
      })
      .map(item => {
        const nameStr = (item.name || '').trim() || (item.raw || '').trim();
        const qty = item.quantity != null ? Number(item.quantity) : 1;
        const lineNumber = Number.isInteger(item.line_number) ? item.line_number
          : item.line_number != null && !isNaN(parseInt(item.line_number, 10)) ? parseInt(item.line_number, 10)
          : null;

        console.log('[OCR LINE]', JSON.stringify({ line_number: lineNumber, name: nameStr, qty }));

        return {
          line_number: lineNumber,
          nume: nameStr,
          cantitate: qty,
        };
      });

    if (!items.length) {
      console.error('NO ITEMS AFTER MAPPING');
      console.log('RAW LINES:', JSON.stringify(rawLines));
    }

    console.log('Parsed items count:', items.length);
    return res.status(200).json({ success: true, factura, items });

  } catch (err) {
    console.error('OCR ERROR:', err.message, err.stack);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
