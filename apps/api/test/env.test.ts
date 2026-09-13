import { test } from 'node:test';
import assert from 'node:assert/strict';

// Set a valid env BEFORE importing env.ts (it parses + may exit at import time).
process.env.DATABASE_URL = 'postgres://user:pw@localhost:5432/vb';
delete process.env.PORT;
const { env } = await import('../src/env.ts');

test('env defaults PORT to 3000 when unset', () => {
  assert.equal(env.PORT, 3000);
});
test('env keeps a valid DATABASE_URL', () => {
  assert.equal(env.DATABASE_URL, 'postgres://user:pw@localhost:5432/vb');
});
