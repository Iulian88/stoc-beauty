const INVOICE_PROMPT = `You are an OCR extraction engine for invoices.

Extract EXACTLY what you see. DO NOT normalize, DO NOT rename products.

Return ONLY this JSON (no markdown, no explanations):

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
      "unit_price": null,
      "total": null,
      "unit": ""
    }
  ]
}

Rules:
- Keep product names EXACTLY as printed on the invoice
- If unsure about any field → null
- DO NOT invent values
- DO NOT merge lines
- lines must contain only real product/service rows (no subtotals, VAT rows, or summaries)
- Convert numbers to numeric type, strip symbols: "1.200,00" => 1200
- Return ONLY JSON. Nothing else.
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
          max_tokens: 2048,
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

    const data = await claudeRes.json();
    const text = data.content?.[0]?.text ?? '';
    console.log('Claude raw response:', text.slice(0, 500));

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
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (!objMatch) {
      console.error('No JSON object found in Claude response:', text.slice(0, 300));
      return res.status(200).json({ factura: null, items: [], raw: text });
    }

    let parsed;
    try {
      parsed = JSON.parse(objMatch[0]);
    } catch {
      console.error('Invalid JSON from Claude (invoice):', objMatch[0].slice(0, 300));
      return res.status(200).json({ factura: null, items: [], raw: text });
    }

    // Support both new schema { invoice: {}, lines: [] } and legacy flat schema
    const inv = parsed.invoice ?? parsed;
    const totalVal = typeof inv.total === 'number' ? inv.total : null;
    const vatVal = typeof inv.vat === 'number' ? inv.vat : null;

    // Map Claude schema to frontend schema
    const factura = {
      numar: inv.number ?? inv.invoice_number ?? null,
      data: inv.date ?? null,
      furnizor: inv.supplier ?? null,
      client: null,
      total_fara_tva: totalVal !== null && vatVal !== null
        ? Math.round((totalVal - vatVal) * 100) / 100
        : null,
      total_tva: vatVal,
      total_general: totalVal,
      currency: inv.currency ?? null,
    };

    const rawItems = Array.isArray(parsed.lines) ? parsed.lines
      : Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems
      .filter(item => item && typeof item.name === 'string' && item.name.trim())
      .map(item => ({
        nume: item.name.trim(),
        cantitate: typeof item.quantity === 'number' ? item.quantity : 1,
        pret: typeof item.unit_price === 'number' ? item.unit_price : null,
        total_pret: typeof (item.total ?? item.total_price) === 'number' ? (item.total ?? item.total_price) : null,
      }));

    console.log('Parsed items count:', items.length);
    return res.status(200).json({ factura, items });

  } catch (err) {
    console.error('OCR ERROR:', err.message, err.stack);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
