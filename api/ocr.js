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

const INVOICE_PROMPT = `You are a strict JSON generator.

Return ONLY valid JSON.

DO NOT:
* add explanations
* add markdown
* add \`\`\`json fences
* add text before or after JSON

Output must be directly parsable by JSON.parse()

If you are unsure about a value → use null

Extract invoice data from the image using this schema:

{
  "invoice": {
    "number": "",
    "date": "",
    "supplier": "",
    "currency": "",
    "total": null,
    "vat": null
  },
  "lines": [
    {
      "raw": "",
      "name": "",
      "quantity": null,
      "unit": "",
      "list_price": null,
      "discount_pct": null,
      "unit_price": null,
      "total": null
    }
  ]
}

Rules:
- Keep product names EXACTLY as printed on the invoice
- lines must contain only real product/service rows (no subtotals, VAT rows, or summaries)
- Convert numbers to numeric type, strip currency symbols: "1.200,00" => 1200
- DO NOT invent values
- DO NOT merge lines
- unit_price = "Pret dupa rabat" (price AFTER discount) — NEVER use "Pret lista"
- If invoice has columns "Pret lista" / "Rabat %" / "Pret dupa rabat": unit_price = the "Pret dupa rabat" column value
- list_price = "Pret lista" or original price before any discount
- discount_pct = discount percentage as a number (e.g. 10 for 10%)
- total = the line total for that row (quantity × unit_price)
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
          max_tokens: 4096,
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
    const totalVal = Number(inv.total) || null;
    const vatVal = Number(inv.vat) || null;

    // Map Claude schema to frontend schema
    const factura = {
      numar: inv.number || inv.invoice_number || '',
      data: inv.date || '',
      furnizor: inv.supplier || '',
      client: null,
      total_fara_tva: totalVal !== null && vatVal !== null
        ? Math.round((totalVal - vatVal) * 100) / 100
        : null,
      total_tva: vatVal,
      total_general: totalVal,
      currency: inv.currency || null,
    };

    const rawLines = Array.isArray(parsed.lines) ? parsed.lines
      : Array.isArray(parsed.items) ? parsed.items : [];

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
        const lineTotal = (item.total ?? item.total_price) != null ? Number(item.total ?? item.total_price) : null;
        const listPrice = item.list_price != null ? Number(item.list_price) : null;
        const discountPct = item.discount_pct != null ? Number(item.discount_pct) : null;

        // Priority 1: unit_price from Claude (should be "Pret dupa rabat" per prompt)
        let unitPrice = item.unit_price != null ? Number(item.unit_price) : null;
        let source = 'direct';

        // Detect wrong extraction: discount exists but unit_price ≈ list_price → Claude returned list price by mistake
        if (unitPrice !== null && listPrice !== null && discountPct != null && discountPct > 0) {
          if (Math.abs(unitPrice - listPrice) < 0.01) {
            console.log('[OCR LINE] REJECT — unit_price ≈ list_price with discount, forcing fallback:', nameStr, { unitPrice, listPrice, discountPct });
            unitPrice = null;
          }
        }

        // Priority 2: compute from total / quantity
        if (unitPrice === null && lineTotal !== null && qty > 0) {
          unitPrice = Math.round((lineTotal / qty) * 100) / 100;
          source = 'computed';
        }

        if (unitPrice !== null && source === 'direct') source = 'discount';
        if (unitPrice === null) source = 'unknown';

        // Validate: unit_price × quantity ≈ total (tolerance 1% or 0.05 RON)
        let priceMismatch = false;
        if (unitPrice !== null && lineTotal !== null) {
          const expected = Math.round(unitPrice * qty * 100) / 100;
          const tolerance = Math.max(0.05, expected * 0.01);
          priceMismatch = Math.abs(expected - lineTotal) > tolerance;
        }

        console.log('[OCR LINE]', JSON.stringify({
          name: nameStr,
          qty,
          list_price: listPrice,
          discount_pct: discountPct,
          unit_price_raw: item.unit_price,
          unit_price_final: unitPrice,
          total: lineTotal,
          source,
          price_mismatch: priceMismatch,
        }));

        const confidence =
          (nameStr ? 0.5 : 0) +
          (item.quantity != null ? 0.2 : 0) +
          (unitPrice !== null ? 0.3 : 0);
        return {
          nume: nameStr,
          cantitate: qty,
          pret: unitPrice,
          total_pret: lineTotal,
          list_price: listPrice,
          discount_pct: discountPct,
          source,
          price_mismatch: priceMismatch,
          rawLine: (item.raw || '').trim(),
          confidence,
          needs_review: !item.name,
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
