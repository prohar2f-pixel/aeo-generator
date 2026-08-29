import { resolve4, resolve6 } from 'node:dns/promises';

const ALLOWED_ORIGINS = [
  'https://aeo.aiprohar.ru',
  'https://prohar2f-pixel.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

const MODEL = 'anthropic/claude-3-haiku';
const MAX_TEXT = 12000;
const MAX_SITE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 15000;
const ALLOWED_CONTENT_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];

class RequestError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(headers, status, body) {
  return new Response(JSON.stringify(body), { status, headers });
}

function isBlockedIpv4(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d+$/.test(part))) return false;
  const bytes = parts.map(Number);
  if (bytes.some(byte => byte < 0 || byte > 255)) return true;
  const [a, b] = bytes;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 192 && b === 88 && bytes[2] === 99)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && bytes[2] === 100)
    || (a === 203 && b === 0 && bytes[2] === 113)
    || a >= 224;
}

function parseIpv6Words(hostname) {
  const parts = hostname.split('::');
  if (parts.length > 2) return null;

  const parseSide = side => {
    if (!side) return [];
    const words = [];
    for (const token of side.split(':')) {
      if (!/^[0-9a-f]{1,4}$/i.test(token)) return null;
      words.push(Number.parseInt(token, 16));
    }
    return words;
  };

  const left = parseSide(parts[0]);
  const right = parseSide(parts[1] || '');
  if (!left || !right) return null;
  if (parts.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array(missing).fill(0), ...right];
}

function isBlockedIpv6(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const words = parseIpv6Words(normalized);
  if (!words) return true;

  const allZero = words.every(word => word === 0);
  const loopback = words.slice(0, 7).every(word => word === 0) && words[7] === 1;
  const uniqueLocal = (words[0] & 0xfe00) === 0xfc00;
  const linkLocal = (words[0] & 0xffc0) === 0xfe80;
  const multicast = (words[0] & 0xff00) === 0xff00;
  const documentation = words[0] === 0x2001 && words[1] === 0x0db8;
  const discardOnly = words[0] === 0x0100 && words.slice(1, 4).every(word => word === 0);
  const sixToFour = words[0] === 0x2002;
  const nat64 = words[0] === 0x0064 && words[1] === 0xff9b && words.slice(2, 6).every(word => word === 0);
  const ipv4Mapped = words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff;

  if (ipv4Mapped) {
    const ipv4 = [words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff].join('.');
    return isBlockedIpv4(ipv4);
  }
  return allZero || loopback || uniqueLocal || linkLocal || multicast || documentation || discardOnly || sixToFour || nat64;
}

function isBlockedHostname(rawHostname) {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) return true;
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;
  if (hostname.includes(':')) return isBlockedIpv6(hostname);
  return isBlockedIpv4(hostname);
}

function parsePublicUrl(rawUrl, redirect = false) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RequestError('invalid_url', 400);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new RequestError('invalid_url', 400);
  }
  if (isBlockedHostname(url.hostname)) {
    throw new RequestError(redirect ? 'blocked_redirect' : 'blocked_url', 400);
  }
  return url;
}

async function resolveHostname(hostname) {
  if (isBlockedIpv4(hostname) || hostname.includes(':')) return [hostname];
  const results = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const addresses = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (addresses.length === 0) throw new RequestError('dns_failed', 502);
  return addresses;
}

async function assertPublicResolution(url, redirect, resolver = resolveHostname) {
  let addresses;
  try {
    addresses = await resolver(url.hostname);
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('dns_failed', 502);
  }
  if (!Array.isArray(addresses) || addresses.length === 0) throw new RequestError('dns_failed', 502);
  if (addresses.some(isBlockedHostname)) {
    throw new RequestError(redirect ? 'blocked_redirect' : 'blocked_url', 400);
  }
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new RequestError('fetch_timeout', 504);
    throw new RequestError('fetch_failed', 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function readBodyWithLimit(response) {
  const declaredLength = Number(response.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_SITE_BYTES) throw new RequestError('site_too_large', 413);

  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_SITE_BYTES) throw new RequestError('site_too_large', 413);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_SITE_BYTES) {
      await reader.cancel();
      throw new RequestError('site_too_large', 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchPublicPage(rawUrl, resolver) {
  let current = parsePublicUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicResolution(current, redirectCount > 0, resolver);
    const response = await fetchWithTimeout(current.href, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AiProharAuditBot/1.0; +https://aiprohar.ru/)' },
      redirect: 'manual',
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('Location');
      if (!location) throw new RequestError('invalid_redirect', 502);
      if (redirectCount === MAX_REDIRECTS) throw new RequestError('too_many_redirects', 502);
      current = parsePublicUrl(new URL(location, current).href, true);
      continue;
    }

    if (!response.ok) throw new RequestError('upstream_http_error', 502);
    const contentType = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) throw new RequestError('unsupported_content_type', 415);

    return readBodyWithLimit(response);
  }

  throw new RequestError('too_many_redirects', 502);
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
  "services": [{"name": "название услуги", "price": "цена цифрами", "currency": "RUB"}],
  "faq": [{"q": "вопрос", "a": "ответ"}]
}

Правила:
- price - только цифры без символа валюты и пробелов
- Извлеки максимум 6 услуг и 5 FAQ
- services и faq могут быть пустыми массивами
- Для отсутствующих полей используй пустую строку

Текст сайта:
`;

async function analyzeWithAi(text, env) {
  if (!env.OPENROUTER_API_KEY) throw new RequestError('ai_not_configured', 503);
  let response;
  try {
    response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aeo.aiprohar.ru/',
        'X-Title': 'SEO + AI Visibility Generator',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: PROMPT + text }],
      }),
    });
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('ai_failed', 502);
  }

  if (!response.ok) throw new RequestError('ai_failed', 502);
  let payload;
  try {
    payload = await response.json();
    const rawContent = payload.choices?.[0]?.message?.content || '';
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('missing JSON');
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new RequestError('ai_invalid_response', 502);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (!ALLOWED_ORIGINS.includes(origin)) {
      return jsonResponse({ 'Content-Type': 'application/json' }, 403, {
        ok: false,
        error: 'origin_not_allowed',
      });
    }

    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST') return jsonResponse(headers, 405, { ok: false, error: 'method_not_allowed' });

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(headers, 400, { ok: false, error: 'bad_json' });
    }

    try {
      const target = parsePublicUrl(body.url);
      if (env.AUDIT_RATE_LIMITER) {
        const { success } = await env.AUDIT_RATE_LIMITER.limit({ key: target.hostname });
        if (!success) throw new RequestError('rate_limited', 429);
      }
      const siteHtml = await fetchPublicPage(target.href, env.RESOLVE_HOSTNAME);
      const text = extractText(siteHtml);
      const data = await analyzeWithAi(text, env);
      return jsonResponse(headers, 200, { ok: true, data });
    } catch (error) {
      const known = error instanceof RequestError;
      return jsonResponse(headers, known ? error.status : 500, {
        ok: false,
        error: known ? error.code : 'internal_error',
      });
    }
  },
};
