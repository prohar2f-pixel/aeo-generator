import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';

import { createAnalyzerServer } from './http-server.js';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function request(port, { method = 'GET', path = '/v1/analyze', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function withServer(workerHandler, run) {
  const server = createAnalyzerServer({ workerHandler, env: { TEST_VALUE: 'present' } });
  const port = await listen(server);
  try {
    await run(port);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('adapts POST /v1/analyze to a standard Request and Response', async () => {
  await withServer(async (standardRequest, env) => {
    assert.equal(standardRequest.method, 'POST');
    assert.equal(new URL(standardRequest.url).pathname, '/v1/analyze');
    assert.equal(standardRequest.headers.get('origin'), 'https://aeo.aiprohar.ru');
    assert.deepEqual(await standardRequest.json(), { url: 'https://example.com' });
    assert.equal(env.TEST_VALUE, 'present');
    return new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: { 'content-type': 'application/json', 'x-adapter': 'yes' },
    });
  }, async port => {
    const response = await request(port, {
      method: 'POST',
      headers: { origin: 'https://aeo.aiprohar.ru', 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    assert.equal(response.status, 202);
    assert.equal(response.headers['x-adapter'], 'yes');
    assert.deepEqual(JSON.parse(response.body), { ok: true });
  });
});

test('allows OPTIONS but rejects other methods without invoking the worker', async () => {
  let calls = 0;
  await withServer(async () => { calls += 1; return new Response(); }, async port => {
    assert.equal((await request(port, { method: 'OPTIONS' })).status, 200);
    assert.equal((await request(port, { method: 'GET' })).status, 405);
    assert.equal(calls, 1);
  });
});

test('returns 404 for paths other than /v1/analyze', async () => {
  await withServer(async () => new Response(), async port => {
    assert.equal((await request(port, { method: 'POST', path: '/other' })).status, 404);
  });
});

test('returns 400 for malformed JSON before invoking the worker', async () => {
  let calls = 0;
  await withServer(async () => { calls += 1; return new Response(); }, async port => {
    const response = await request(port, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(JSON.parse(response.body), { ok: false, error: 'bad_json' });
    assert.equal(calls, 0);
  });
});

test('returns 413 when the request body exceeds 32 KiB', async () => {
  await withServer(async () => new Response(), async port => {
    const body = JSON.stringify({ url: `https://example.com/${'a'.repeat(33 * 1024)}` });
    const response = await request(port, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      body,
    });
    assert.equal(response.status, 413);
    assert.deepEqual(JSON.parse(response.body), { ok: false, error: 'body_too_large' });
  });
});

test('hides unhandled worker errors from clients', async () => {
  await withServer(async () => { throw new Error('secret stack detail'); }, async port => {
    const response = await request(port, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(response.body), { ok: false, error: 'internal_error' });
    assert.equal(response.body.includes('secret stack detail'), false);
  });
});
