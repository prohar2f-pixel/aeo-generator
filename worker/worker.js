const ALLOWED_ORIGIN = 'https://prohar2f-pixel.github.io';
const MODEL = 'anthropic/claude-haiku-4-5-20251001';
const MAX_TEXT = 12000;

function corsHeaders(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

const PROMPT = `Извлеки данные бизнеса из текста сайта. Верни ТОЛЬКО валидный JSON без объяснений:
{
  "name": "имя человека или название компании",
  "jobTitle": "должность или специальность",
  "phone": "телефон с кодом страны или пустая строка",
  "email": "email или пустая строка",
  "telegram": "@username или пустая строка",
  "city": "город или пустая строка",
  "services": [
    {"name": "название услуги", "price": "цена цифрами", "currency": "RUB"}
  ],
  "faq": [
    {"q": "вопрос", "a": "ответ"}
  ]
}

Правила:
- price — только цифры без ₽ и пробелов (например "30000")
- Извлеки максимум 6 услуг и 5 FAQ
- services и faq могут быть пустыми массивами
- Для отсутствующих полей используй пустую строку

Текст сайта:
`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), { status: 405, headers });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'bad_json' }), { status: 400, headers });
    }

    const { url } = body;
    if (!url || !url.startsWith('http')) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_url' }), { status: 400, headers });
    }

    // Fetch target site
    let siteHtml;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AEOBot/1.0)' },
        redirect: 'follow',
      });
      siteHtml = await res.text();
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: 'fetch_failed', detail: err.message }), { status: 502, headers });
    }

    const text = extractText(siteHtml);

    // Call Claude via OpenRouter
    let aiResponse;
    try {
      const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://prohar2f-pixel.github.io/aeo-generator/',
          'X-Title': 'AEO Generator',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          messages: [{ role: 'user', content: PROMPT + text }],
        }),
      });
      const aiJson = await aiRes.json();
      const rawContent = aiJson.choices?.[0]?.message?.content || '';
      // Extract JSON from response (Claude sometimes wraps in ```json blocks)
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('no_json_in_response');
      aiResponse = JSON.parse(jsonMatch[0]);
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: 'ai_failed', detail: err.message }), { status: 502, headers });
    }

    return new Response(JSON.stringify({ ok: true, data: aiResponse }), { headers });
  },
};
