import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { getCachedEmbedding, putCachedEmbedding } from '../src/search/embeddingCache.ts';
import { seedDatabase } from '../seed/seed.ts';

before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes, query_embedding_cache RESTART IDENTITY CASCADE`);
  await seedDatabase(db);
});
after(() => pool.end());

function fakeVec(n: number): number[] {
  return new Array(1536).fill(0.001).map((v, i) => v + (i === 0 ? n : 0));
}

test('put → get roundtrip through pgvector text form', async () => {
  const vec = fakeVec(42);
  await putCachedEmbedding('test query', 'model-a', vec);
  const retrieved = await getCachedEmbedding('test query', 'model-a');
  assert.ok(retrieved);
  assert.equal(retrieved![0], vec[0]);
  assert.equal(retrieved![1536 - 1], vec[1536 - 1]);
});

test('get on miss returns null', async () => {
  const retrieved = await getCachedEmbedding('nonexistent query', 'model-a');
  assert.equal(retrieved, null);
});

test('normalization shares the key: "Pad Thai" get hits "padthai" put', async () => {
  const vec = fakeVec(99);
  await putCachedEmbedding('padthai', 'model-x', vec);
  // Different casing/format should hit the same normalized key
  const retrieved = await getCachedEmbedding('Pad thai', 'model-x');
  assert.ok(retrieved, 'normalized query should find cached embedding');
  assert.equal(retrieved![0], vec[0]);
});

test('empty query returns null (normalizes to empty string)', async () => {
  const retrieved = await getCachedEmbedding('!!!', 'model-a');
  assert.equal(retrieved, null);
});

// Plan Task 5's load-bearing case: the cache is an optimization, never a correctness
// dependency — ANY DB failure must degrade to a miss, not throw into the route.
test('failed DB call degrades to a miss: get → null, put resolves', async (t) => {
  t.mock.method(db, 'execute', () => { throw new Error('connection refused'); });
  assert.equal(await getCachedEmbedding('pad thai', 'model-a'), null);
  await assert.doesNotReject(putCachedEmbedding('pad thai', 'model-a', fakeVec(1)));
});
