import { test } from 'node:test';
import assert from 'node:assert/strict';
// Import the BUILT package entry (self-reference → dist via exports) — src/index.ts re-exports
// './domain.js', which only resolves post-build. Run `npm run build` before this test.
import { healthResponse } from '@vegan-bangkok/schemas';

test('healthResponse accepts a valid ok payload', () => {
  const r = healthResponse.parse({ status: 'ok', uptime: 12.3 });
  assert.equal(r.status, 'ok');
  assert.equal(r.uptime, 12.3);
});
test('healthResponse rejects a non-ok status', () => {
  assert.equal(healthResponse.safeParse({ status: 'down', uptime: 1 }).success, false);
});
test('healthResponse requires a numeric uptime', () => {
  assert.equal(healthResponse.safeParse({ status: 'ok' }).success, false);
});
