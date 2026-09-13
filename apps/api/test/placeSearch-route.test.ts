import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { buildApp } from '../src/app.ts';
import { db, pool } from '../src/db/index.ts';
import { seedDatabase } from '../seed/seed.ts';
import { backfillEmbeddings } from '../src/embed/job.ts';
import { setPipelineForTests, type ZeroShotFn } from '../src/search/slmClassifier.ts';

const fakeEmbed = async (t: string[]) => t.map(() => new Array(1536).fill(0.5));

before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes, query_embedding_cache RESTART IDENTITY CASCADE`);
  await seedDatabase(db);
  await backfillEmbeddings(db, fakeEmbed);
  // Places aren't embedded by the dish backfill job (production embeds them via the
  // separate enrich-places pipeline); stub a constant vector here so vectorArm has
  // something to match against for queries with no geo/lexical signal.
  const fakeVec = `[${new Array(1536).fill(0.5).join(',')}]`;
  await db.execute(sql`UPDATE places SET embedding = ${fakeVec}::vector`);
});
after(() => pool.end());
afterEach(() => setPipelineForTests(null));

test('district query: results, intent echoed, no fallback', async () => {
  const app = await buildApp({ embedFn: fakeEmbed });
  const res = await app.inject({ method: 'POST', url: '/search/places',
    payload: { q: 'best vegan restaurant in Thonglor' } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.fallback, false);
  assert.equal(body.intent.primaryLocation, 'Thonglor');
  assert.equal(body.intent.intentType, 'best');
  assert.ok(body.results.length > 0);
  await app.close();
});

const slmTop = (topLabel: string): ZeroShotFn => async (_t, labels) => ({
  labels: [topLabel, ...labels.filter((l) => l !== topLabel)],
  scores: labels.map((_, i) => (i === 0 ? 0.9 : 0.01)),
});

test('garbage query + working SLM: real retrieval, fallback false', async () => {
  setPipelineForTests(slmTop('a relaxed casual place to eat, no particular criteria'));
  const app = await buildApp({ embedFn: fakeEmbed });
  const res = await app.inject({ method: 'POST', url: '/search/places',
    payload: { q: 'xzqw florble weirdness' } });
  const body = res.json();
  assert.equal(body.fallback, false);
  assert.equal(body.intent.intentType, 'discovery');
  assert.ok(body.results.length > 0);
  await app.close();
});

test('garbage query + SLM down: slice-1 fallback preserved', async () => {
  setPipelineForTests(async () => { throw new Error('onnx exploded'); });
  const app = await buildApp({ embedFn: fakeEmbed });
  const res = await app.inject({ method: 'POST', url: '/search/places',
    payload: { q: 'xzqw florble weirdness' } });
  const body = res.json();
  assert.equal(body.fallback, true);
  assert.equal(body.fallbackReason, 'low_confidence');
  assert.ok(body.results.length > 0, 'fallback must not be empty on seeded DB');
  await app.close();
});

test('high-confidence query never touches the SLM', async () => {
  setPipelineForTests(async () => { throw new Error('must not be called'); });
  const app = await buildApp({ embedFn: fakeEmbed });
  const res = await app.inject({ method: 'POST', url: '/search/places',
    payload: { q: 'best vegan restaurant in Thonglor' } });
  assert.equal(res.json().fallback, false);
  await app.close();
});

test('embedder down: degraded header, geo+lexical still answer', async () => {
  const app = await buildApp({ embedFn: async () => { throw new Error('gemini down'); } });
  const res = await app.inject({ method: 'POST', url: '/search/places',
    payload: { q: 'vegan cafe in Thonglor' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['x-search-degraded'], '1');
  assert.ok(res.json().results.length > 0);
  await app.close();
});

test('near me with coordinates: nearby intent, distances populated and sorted close-first-ish', async () => {
  const app = await buildApp({ embedFn: fakeEmbed });
  const res = await app.inject({ method: 'POST', url: '/search/places',
    payload: { q: 'vegan food near me', lat: 13.7263, lng: 100.5782 } });
  const body = res.json();
  assert.equal(body.intent.intentType, 'nearby');
  assert.ok(body.results.every((r: any) => r.distanceM === null || r.distanceM <= 2000));
  await app.close();
});
