import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainRateLimiter } from './domain-rate-limiter.js';

test('blocks the eleventh request for one hostname inside 60 seconds', async () => {
  let now = 1_000;
  const limiter = new DomainRateLimiter({ limit: 10, windowMs: 60_000, now: () => now });

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    assert.deepEqual(await limiter.limit({ key: 'example.com' }), { success: true });
  }
  assert.deepEqual(await limiter.limit({ key: 'example.com' }), { success: false });
});

test('keeps counters independent per normalized hostname', async () => {
  const limiter = new DomainRateLimiter({ limit: 1, windowMs: 60_000, now: () => 1_000 });

  assert.deepEqual(await limiter.limit({ key: 'Example.COM' }), { success: true });
  assert.deepEqual(await limiter.limit({ key: 'example.com' }), { success: false });
  assert.deepEqual(await limiter.limit({ key: 'other.example' }), { success: true });
});

test('allows requests again after the rolling window expires', async () => {
  let now = 1_000;
  const limiter = new DomainRateLimiter({ limit: 1, windowMs: 60_000, now: () => now });

  assert.deepEqual(await limiter.limit({ key: 'example.com' }), { success: true });
  now += 60_000;
  assert.deepEqual(await limiter.limit({ key: 'example.com' }), { success: true });
});
