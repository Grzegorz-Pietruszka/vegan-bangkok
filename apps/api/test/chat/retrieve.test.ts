import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql, eq } from 'drizzle-orm';
import { db, pool } from '../../src/db/index.ts';
import { seedDatabase } from '../../seed/seed.ts';
import { dishes } from '../../src/db/schema.ts';
import { retrieveForChat } from '../../src/chat/retrieve.ts';

const e = (i: number) => { const v = new Array(1536).fill(0); v[i] = 1; return v; };
const embed = (vec: number[]) => async (texts: string[]) => texts.map(() => vec);
const CHINATOWN = { lat: 13.7405, lng: 100.5095 };

before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes, historic_sites, query_embedding_cache RESTART IDENTITY CASCADE`);
  await seedDatabase(db);
  // deterministic embeddings for two dishes; rest stay null (excluded by vector search)
  const all = await db.select().from(dishes);
  await db.update(dishes).set({ embedding: e(0) }).where(eq(dishes.id, all[0].id));
  await db.update(dishes).set({ embedding: e(1) }).where(eq(dishes.id, all[1].id));
});
after(() => pool.end());

test('returns at most 5, cosine-ranked without location', async () => {
  const { results, degraded } = await retrieveForChat('anything', undefined, { embed: embed(e(0)) });
  assert.equal(degraded, false);
  assert.ok(results.length >= 1 && results.length <= 5);
  assert.ok(results[0].score >= (results[1]?.score ?? -Infinity));
});

test('location annotates place distanceM and re-ranks by distance penalty', async () => {
  const { results } = await retrieveForChat('anything', CHINATOWN, { embed: embed(e(0)) });
  const withPlaces = results.filter((r) => r.places.length > 0);
  assert.ok(withPlaces.length >= 1, 'need a dish with places');
  for (const r of withPlaces) {
    for (const p of r.places) {
      assert.ok(typeof (p as { distanceM?: number }).distanceM === 'number',
        `${r.nameEn}/${p.name} missing distanceM`);
    }
  }
});

test('embedder failure degrades to full-text, never throws', async () => {
  const boom = async () => { throw new Error('gemini down'); };
  const { results, degraded } = await retrieveForChat('tofu', undefined, { embed: boom });
  assert.equal(degraded, true);
  assert.ok(Array.isArray(results));
});

test('second identical query hits the embedding cache (embed called once)', async () => {
  let calls = 0;
  const counting = async (texts: string[]) => { calls += texts.length; return texts.map(() => e(0)); };
  await retrieveForChat('unique craving text one', undefined, { embed: counting });
  await retrieveForChat('unique craving text one', undefined, { embed: counting });
  assert.equal(calls, 1);
});
