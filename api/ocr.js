const INVOICE_PROMPT = `Extract ONLY the product table from this invoice.
Return STRICT JSON:
[
  { "nume": string, "cantitate": number, "pret": number }
]

Rules:
- Ignore addresses, emails, phone numbers
- Ignore company info
- Ignore headers/footers
- Only extract rows from the product table`;

const ZREPORT_PROMPT = `This is a Z-report (fiscal end-of-day receipt).
Extract ONLY the grand total sales amount in RON.
Return STRICT JSON: { "total": number }
If not found, return: { "total": null }`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { imageBase64, mediaType = 'image/jpeg', type = 'invoice' } = req.body ?? {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Claude API key not configured' });
  }

  const prompt = type === 'zreport' ? ZREPORT_PROMPT : INVOICE_PROMPT;

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
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
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
    return res.status(502).json({ error: 'Network error calling Claude', detail: err.message });
  }

  if (!claudeRes.ok) {
    const errText = await claudeRes.text().catch(() => '');
    return res.status(502).json({ error: 'Claude API error', status: claudeRes.status, detail: errText });
  }

  const data = await claudeRes.json();
  const text = data.content?.[0]?.text ?? '';

  if (type === 'zreport') {
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return res.status(200).json({ total: null });
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ total: typeof parsed.total === 'number' ? parsed.total : null });
    } catch {
      return res.status(200).json({ total: null });
    }
  }

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return res.status(200).json({ items: [] });
  try {
    const items = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ items: Array.isArray(items) ? items : [] });
  } catch {
    return res.status(200).json({ items: [] });
  }
}
