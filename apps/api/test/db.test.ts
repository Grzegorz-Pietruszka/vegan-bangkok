import { test, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgres://user:pw@localhost:5432/vb';
const { db, pool } = await import('../src/db/index.ts');

after(() => pool.end());   // Pool never connected (lazy) — end() resolves cleanly

test('db exposes a drizzle query builder (no connection opened yet)', () => {
  assert.equal(typeof db.select, 'function');
  assert.equal(typeof db.execute, 'function');
});
test('pool is a configured pg Pool', () => {
  assert.equal(typeof pool.end, 'function');
});
