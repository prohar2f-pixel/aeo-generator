import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAnalyzerProxyUrl } from './outbound-proxy.js';

test('accepts only a loopback HTTP proxy', () => {
  assert.equal(validateAnalyzerProxyUrl('http://127.0.0.1:10809'), 'http://127.0.0.1:10809/');
  assert.equal(validateAnalyzerProxyUrl('http://localhost:10809'), 'http://localhost:10809/');
});

test('rejects remote, credentialed, non-HTTP, and malformed proxy URLs', () => {
  for (const value of [
    'http://192.0.2.10:10809',
    'http://user:pass@127.0.0.1:10809',
    'https://127.0.0.1:10809',
    'socks5://127.0.0.1:10808',
    'not-a-url',
  ]) {
    assert.throws(() => validateAnalyzerProxyUrl(value), /invalid_analyzer_proxy_url/);
  }
});
