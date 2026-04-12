const INVOICE_PROMPT = `You are an accounting assistant. Analyze this invoice image and return STRICT JSON with no markdown, no explanation:

{
  "factura": {
    "numar": string | null,
    "data": string | null,
    "furnizor": string | null,
    "client": string | null,
    "pagina_curenta": number | null,
    "total_pagini": number | null,
    "total_fara_tva": number | null,
    "total_tva": number | null,
    "total_general": number | null
  },
  "produse": [
    { "nume": string, "cantitate": number, "pret": number }
  ]
}

CRITICAL RULES — follow exactly:

PRODUCT TABLE:
- Extract ONLY rows from the product/services table
- For unit price: use ONLY the column "Pret dupa rabat" or "Pret unitar dupa reducere"
- If that column is absent, use the net unit price after any discount
- NEVER use "Pret lista" or gross price before discount
- cantitate must be the ordered/delivered quantity (numeric)
- pret must be the final net unit price in RON (numeric, no currency symbol)

METADATA:
- numar: invoice number/series (e.g. "MBAR 123456")
- data: invoice date in ISO format YYYY-MM-DD if possible, else as printed
- furnizor: supplier company name only (no address)
- client: client company name only (no address)
- pagina_curenta / total_pagini: extract from "Pagina X din Y" or similar; null if not present
- total_fara_tva: the subtotal before VAT (RON)
- total_tva: the VAT amount (RON)
- total_general: the grand total payable (RON)

IGNORE:
- Street addresses, postal codes, cities
- Email addresses, phone numbers, fax
- CUI / CIF / registration numbers
- Bank accounts (IBAN)
- Page headers and footers unrelated to amounts
- Any text that is not product rows or the fields listed above

VALIDATION:
- If total_fara_tva + total_tva ≈ total_general, include all three
- If a value is not visible or unreadable, use null — do NOT guess
- Return an empty array for produse if no product table is found`;

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

    const model = 'claude-3-5-sonnet-20241022';
    const prompt = type === 'zreport' ? ZREPORT_PROMPT : INVOICE_PROMPT;
    console.log('Model:', model);

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
                  source: { type: 'base64', media_type: mediaType, data: imageBase64 },
                },
                { type: 'text', text: prompt },
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
      const errText = await claudeRes.text().catch(() => '');
      console.error('Claude API error:', claudeRes.status, errText);
      return res.status(502).json({ error: 'Claude API error', status: claudeRes.status, detail: errText });
    }

    const data = await claudeRes.json();
    const text = data.content?.[0]?.text ?? '';
    console.log('Claude raw response:', text.slice(0, 500));

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

    // Try full invoice object first
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      let parsed;
      try {
        parsed = JSON.parse(objMatch[0]);
      } catch {
        console.error('Invalid JSON from Claude (invoice object):', objMatch[0].slice(0, 300));
        parsed = null;
      }
      if (parsed?.produse !== undefined) {
        return res.status(200).json({
          factura: parsed.factura ?? null,
          items: Array.isArray(parsed.produse) ? parsed.produse : [],
        });
      }
    }

    // Fallback: plain array
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (!arrMatch) {
      console.error('No JSON found in Claude response:', text.slice(0, 300));
      return res.status(200).json({ factura: null, items: [], raw: text });
    }
    let items;
    try {
      items = JSON.parse(arrMatch[0]);
    } catch {
      console.error('Invalid JSON array from Claude:', arrMatch[0].slice(0, 300));
      return res.status(200).json({ factura: null, items: [], raw: text });
    }
    return res.status(200).json({ factura: null, items: Array.isArray(items) ? items : [] });

  } catch (err) {
    console.error('OCR ERROR:', err.message, err.stack);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
