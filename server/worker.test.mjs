import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../worker/worker.js';

const ORIGIN = 'https://aeo.aiprohar.ru';

function analyzeRequest(url, origin = ORIGIN) {
  return new Request('http://127.0.0.1:8789/v1/analyze', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

async function responseError(request, env = {}) {
  const response = await worker.fetch(request, env);
  return { status: response.status, body: await response.json() };
}

test('rejects browser origins outside the allowlist', async () => {
  assert.deepEqual(await responseError(analyzeRequest('https://example.com', 'https://evil.example')), {
    status: 403,
    body: { ok: false, error: 'origin_not_allowed' },
  });
});

for (const [label, url, error] of [
  ['file URLs', 'file:///etc/passwd', 'invalid_url'],
  ['URL credentials', 'https://user:password@example.com', 'invalid_url'],
  ['localhost', 'http://localhost/', 'blocked_url'],
  ['private IPv4', 'http://10.0.0.1/', 'blocked_url'],
  ['loopback IPv4', 'http://127.0.0.1/', 'blocked_url'],
  ['private IPv6', 'http://[fc00::1]/', 'blocked_url'],
  ['loopback IPv6', 'http://[::1]/', 'blocked_url'],
  ['IPv4-mapped loopback IPv6', 'http://[::ffff:7f00:1]/', 'blocked_url'],
  ['IPv4-mapped private IPv6', 'http://[::ffff:a00:1]/', 'blocked_url'],
  ['documentation IPv4', 'http://198.51.100.10/', 'blocked_url'],
  ['documentation IPv4 (TEST-NET-3)', 'http://203.0.113.10/', 'blocked_url'],
]) {
  test(`rejects ${label} before fetching`, async () => {
    assert.deepEqual(await responseError(analyzeRequest(url), {
      AUDIT_RATE_LIMITER: { limit: async () => ({ success: false }) },
    }), {
      status: 400,
      body: { ok: false, error },
    });
  });
}

test('rejects a hostname when DNS resolves to a private address', async () => {
  assert.deepEqual(await responseError(analyzeRequest('https://example.com'), {
    RESOLVE_HOSTNAME: async () => ['192.168.1.10'],
  }), {
    status: 400,
    body: { ok: false, error: 'blocked_url' },
  });
});

test('revalidates a redirect target before following it', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, {
    status: 302,
    headers: { location: 'http://127.0.0.1/private' },
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  assert.deepEqual(await responseError(analyzeRequest('https://example.com'), {
    RESOLVE_HOSTNAME: async () => ['93.184.216.34'],
  }), {
    status: 400,
    body: { ok: false, error: 'blocked_redirect' },
  });
});

test('rejects unsupported upstream content types before AI analysis', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('image', {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  assert.deepEqual(await responseError(analyzeRequest('https://example.com'), {
    RESOLVE_HOSTNAME: async () => ['93.184.216.34'],
  }), {
    status: 415,
    body: { ok: false, error: 'unsupported_content_type' },
  });
});

test('rejects an upstream response declared larger than 5 MiB', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('small', {
    status: 200,
    headers: {
      'content-type': 'text/html',
      'content-length': String(5 * 1024 * 1024 + 1),
    },
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  assert.deepEqual(await responseError(analyzeRequest('https://example.com'), {
    RESOLVE_HOSTNAME: async () => ['93.184.216.34'],
  }), {
    status: 413,
    body: { ok: false, error: 'site_too_large' },
  });
});
