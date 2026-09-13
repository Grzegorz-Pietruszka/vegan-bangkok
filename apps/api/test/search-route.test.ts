import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { buildApp } from '../src/app.ts';
import { db, pool } from '../src/db/index.ts';
import { dishes } from '../src/db/schema.ts';
import { seedDatabase } from '../seed/seed.ts';
import { backfillEmbeddings } from '../src/embed/job.ts';

before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes, query_embedding_cache RESTART IDENTITY CASCADE`);
  await seedDatabase(db);
  await backfillEmbeddings(db, async (texts) => texts.map(() => new Array(1536).fill(0.5)));
});
after(() => pool.end());

test('Tier 1: name query → matchType "name", embedder never called', async () => {
  let embedCalls = 0;
  const embedFn = async (t: string[]) => {
    embedCalls++;
    return t.map(() => new Array(1536).fill(0.5));
  };
  const app = await buildApp({ embedFn });
  const res = await app.inject({ method: 'POST', url: '/search', payload: { q: 'Pad thai' } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.matchType, 'name');
  assert.ok(body.results.length >= 1);
  assert.equal(embedCalls, 0, 'embedder should not be called for full-name match');
  await app.close();
});

test('Tier 1.5: transliteration alias → matchType "alias", embedder never called', async () => {
  let embedCalls = 0;
  const embedFn = async (t: string[]) => {
    embedCalls++;
    return t.map(() => new Array(1536).fill(0.5));
  };
  const app = await buildApp({ embedFn });
  const res = await app.inject({ method: 'POST', url: '/search', payload: { q: 'kow soi' } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.matchType, 'alias');
  assert.equal(body.results[0].nameEn, 'Khao soi');
  assert.equal(embedCalls, 0, 'alias tier must answer without Gemini');
  await app.close();
});

test('Tier 1.5 never overrides Tier 1: exact-name hit wins over a conflicting alias', async () => {
  // pathological alias: "pad thai" pointing at Khao soi — the name gate must still win
  const [khaoSoi] = (await db.execute(sql`SELECT id FROM dishes WHERE name_en = 'Khao soi'`)).rows;
  await db.execute(sql`
    INSERT INTO dish_aliases (dish_id, alias_text, alias_normalized)
    VALUES (${khaoSoi!.id}::uuid, 'pad thai (conflict fixture)', 'padthai')
    ON CONFLICT (alias_normalized) DO NOTHING`);
  try {
    const app = await buildApp({ embedFn: async (t) => t.map(() => new Array(1536).fill(0.5)) });
    const res = await app.inject({ method: 'POST', url: '/search', payload: { q: 'Pad thai' } });
    assert.equal(res.json().matchType, 'name');
    assert.equal(res.json().results[0].nameEn, 'Pad thai');
    await app.close();
  } finally {
    await db.execute(sql`DELETE FROM dish_aliases WHERE alias_normalized = 'padthai'`);
  }
});

test('Tier 2: "curry" (partial word) → semantic, embedder called once', async () => {
  let embedCalls = 0;
  const embedFn = async (t: string[]) => {
    embedCalls++;
    return t.map(() => new Array(1536).fill(0.5));
  };
  const app = await buildApp({ embedFn });
  const res = await app.inject({ method: 'POST', url: '/search', payload: { q: 'curry' } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.matchType, 'semantic');
  assert.equal(embedCalls, 1, 'embedder should be called for semantic search');
  await app.close();
});

test('Tier 2: natural-language query → semantic, results validated + ranked', async () => {
  let embedCalls = 0;
  const embedFn = async (t: string[]) => {
    embedCalls++;
    return t.map(() => new Array(1536).fill(0.5));
  };
  const app = await buildApp({ embedFn });
  const res = await app.inject({ method: 'POST', url: '/search', payload: { q: 'something creamy and mild for dinner' } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.matchType, 'semantic');
  assert.equal(embedCalls, 1);
  assert.ok(body.results.length >= 1, 'embedded dishes must come back');
  assert.equal(typeof body.results[0].nameEn, 'string');
  assert.equal(typeof body.results[0].score, 'number');
  for (let i = 1; i < body.results.length; i++) {
    assert.ok(body.results[i - 1].score >= body.results[i].score, 'results must be ranked');
  }
  await app.close();
});

test('Tier 3: embedder throws → keyword + HTTP 200 + x-search-degraded header', async () => {
  const embedFn = async () => {
    throw new Error('Gemini quota exceeded');
  };
  const app = await buildApp({ embedFn });
  const res = await app.inject({ method: 'POST', url: '/search', payload: { q: 'something creamy' } });
  assert.equal(res.statusCode, 200, 'should not 5xx on Gemini failure');
  const body = res.json();
  assert.equal(body.matchType, 'keyword');
  assert.equal(res.headers['x-search-degraded'], '1');
  await app.close();
});

test('Cache hit: repeat query does not call embedder again', async () => {
  let embedCalls = 0;
  const embedFn = async (t: string[]) => {
    embedCalls++;
    return t.map(() => new Array(1536).fill(0.5));
  };
  const app = await buildApp({ embedFn });
  // First query: hits cache miss, calls embedder
  const res1 = await app.inject({ method: 'POST', url: '/search', payload: { q: 'test cache query' } });
  assert.equal(res1.statusCode, 200);
  assert.equal(embedCalls, 1);
  // Second identical query: hits cache, no embedder call
  const res2 = await app.inject({ method: 'POST', url: '/search', payload: { q: 'test cache query' } });
  assert.equal(res2.statusCode, 200);
  assert.equal(embedCalls, 1, 'second call should hit cache, embedder not called again');
  await app.close();
});

test('GET /dishes/:id/similar returns neighbours with matchType semantic', async () => {
  const embedFn = async (t: string[]) => t.map(() => new Array(1536).fill(0.5));
  const app = await buildApp({ embedFn });
  const [dish] = await db.select({ id: dishes.id }).from(dishes).limit(1);
  const res = await app.inject({ method: 'GET', url: `/dishes/${dish.id}/similar` });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.matchType, 'semantic');
  assert.ok(body.results.length >= 1, 'a real dish must have embedded neighbours');
  assert.ok(body.results.every((r: any) => r.id !== dish.id), 'seed dish must be excluded');
  await app.close();
});
