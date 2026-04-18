const INVOICE_PROMPT = `
You are a strict financial OCR extraction engine specialized in invoices.

Your job is to extract ONLY factual, visible data from the provided invoice image.

=====================================
CRITICAL BEHAVIOR RULES (NON-NEGOTIABLE)
=====================================

- DO NOT guess, infer, or invent any data
- ONLY extract data that is clearly visible in the image
- If a field is missing or unclear → return null
- If no products/services are clearly listed → return an empty array []
- DO NOT hallucinate line items
- DO NOT interpret totals as products
- DO NOT return explanations, comments, or markdown

=====================================
OUTPUT FORMAT (STRICT JSON ONLY)
=====================================

Return EXACTLY this JSON structure:

{
  "supplier": string | null,
  "invoice_number": string | null,
  "date": string | null,
  "currency": string | null,
  "total": number | null,
  "vat": number | null,
  "items": [
    {
      "name": string,
      "quantity": number | null,
      "unit_price": number | null,
      "total_price": number | null
    }
  ]
}

=====================================
FIELD EXTRACTION RULES
=====================================

SUPPLIER:
- Extract company issuing the invoice
- Usually at top or header section

INVOICE NUMBER:
- Look for: "Invoice number", "No.", "Nr.", "Invoice #"

DATE:
- Extract issue date (NOT due date unless only one exists)
- Format as YYYY-MM-DD if possible

CURRENCY:
- Detect from symbols or text (USD, EUR, RON, etc.)

TOTAL:
- Extract FINAL payable amount (not subtotal)
- Look for: "Total", "Amount due", "Grand total"

VAT:
- Extract VAT value if present
- Ignore percentage unless value is also present

=====================================
LINE ITEMS (MOST IMPORTANT)
=====================================

- Extract ONLY real products/services from table rows
- Each item must be a real purchasable unit
- Ignore:
  - Subtotal
  - VAT lines
  - Shipping (unless clearly a billed item)
  - Payment summaries

Each item:
- name => REQUIRED (must exist)
- quantity => if visible
- unit_price => if visible
- total_price => if visible

If table exists => parse row by row

If NO clear items exist:
=> return "items": []

=====================================
NUMBER RULES
=====================================

- Convert all numbers to numeric format (no symbols)
- Example:
  "$12.50" => 12.5
  "1,200.00" => 1200

=====================================
VALIDATION BEFORE OUTPUT
=====================================

- items MUST be an array
- NEVER return text outside JSON
- NEVER include explanations
- NEVER fabricate data
- JSON must be valid and parsable

=====================================
FINAL OUTPUT RULE
=====================================

Return ONLY JSON. Nothing else.
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

    const model = 'claude-3-haiku-20240307';
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
      return res.status(claudeRes.status).json({
        error: 'Claude API error',
        status: claudeRes.status,
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

    // Map new Claude schema to existing frontend schema
    const factura = {
      numar: parsed.invoice_number ?? null,
      data: parsed.date ?? null,
      furnizor: parsed.supplier ?? null,
      client: null,
      total_fara_tva: typeof parsed.total === 'number' && typeof parsed.vat === 'number'
        ? Math.round((parsed.total - parsed.vat) * 100) / 100
        : null,
      total_tva: typeof parsed.vat === 'number' ? parsed.vat : null,
      total_general: typeof parsed.total === 'number' ? parsed.total : null,
      currency: parsed.currency ?? null,
    };

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems
      .filter(item => item && typeof item.name === 'string' && item.name.trim())
      .map(item => ({
        nume: item.name.trim(),
        cantitate: typeof item.quantity === 'number' ? item.quantity : 1,
        pret: typeof item.unit_price === 'number' ? item.unit_price : null,
        total_pret: typeof item.total_price === 'number' ? item.total_price : null,
      }));

    console.log('Parsed items count:', items.length);
    return res.status(200).json({ factura, items });

  } catch (err) {
    console.error('OCR ERROR:', err.message, err.stack);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
