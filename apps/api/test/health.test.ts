import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthResponse } from '@vegan-bangkok/schemas';

process.env.NODE_ENV = 'test';                 // JSON logs, no pino-pretty worker
process.env.DATABASE_URL = 'postgres://user:pw@localhost:5432/vb';
const { buildApp } = await import('../src/app.ts');

test('GET /health returns a payload that satisfies the shared healthResponse schema', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(healthResponse.safeParse(body).success, true);
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.uptime, 'number');
  await app.close();
});

test('an unknown route returns 404', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/does-not-exist' });
  assert.equal(res.statusCode, 404);
  await app.close();
});
