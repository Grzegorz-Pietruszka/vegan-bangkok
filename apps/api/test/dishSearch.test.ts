import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { seedDatabase } from '../seed/seed.ts';
import { backfillEmbeddings } from '../src/embed/job.ts';
import { searchByVector, searchSimilar, searchByName, searchByAlias, searchFullText } from '../src/search/dishSearch.ts';
import { dishes } from '../src/db/schema.ts';

// Isolate + guarantee a ≥2-dish corpus: with a single dish, the searchSimilar
// exclusion assertion below would pass vacuously (every() over []).
before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes RESTART IDENTITY CASCADE`);
  await seedDatabase(db);
  await db.insert(dishes).values({ nameEn: 'Test noodle soup', description: 'test fixture — second dish so similarity has a neighbour' });
  // deterministic fake vectors so nearest-neighbour is well-defined
  await backfillEmbeddings(db, async (texts) => texts.map((_, i) => vec(i)));
});
after(() => pool.end());

test('searchByVector returns dishes with their verified places + score', async () => {
  const results = await searchByVector(vec(0), { limit: 5 });
  assert.ok(results.length >= 2);           // both embedded dishes rank
  assert.ok('score' in results[0]);
  assert.ok(results[0].score >= results[1].score);  // ranked by similarity
  assert.ok(Array.isArray(results[0].places));
  const somTam = results.find((r) => r.nameEn === 'Som tam');
  assert.equal(typeof somTam?.places[0]?.verifiedVegan, 'boolean');
});

test('searchSimilar excludes the seed dish itself and returns its neighbour', async () => {
  const [d] = await db.select({ id: dishes.id }).from(dishes).limit(1);
  const results = await searchSimilar(d.id, { limit: 5 });
  assert.ok(results.length >= 1);           // the other dish must appear — exclusion is exercised for real
  assert.ok(results.every((r) => r.id !== d.id));
});

test('searchByName: full EN name → hit with score 1.0', async () => {
  const results = await searchByName('Pad thai');
  assert.equal(results.length, 1);
  assert.equal(results[0].nameEn, 'Pad thai');
  assert.equal(results[0].score, 1.0);
});

test('searchByName: normalized query → hit', async () => {
  const results = await searchByName('padthai');
  assert.equal(results.length, 1);
  assert.equal(results[0].nameEn, 'Pad thai');
});

test('searchByName: Thai full name → hit with score 1.0', async () => {
  const results = await searchByName('ส้มตำ');
  assert.ok(results.length >= 1);
  const match = results.find((r) => r.nameTh === 'ส้มตำ');
  assert.ok(match);
  assert.equal(match!.score, 1.0);
});

test('searchByName: partial words → empty (full-name equality only)', async () => {
  const curry = await searchByName('curry');
  assert.equal(curry.length, 0, 'partial word should not match');

  const pad = await searchByName('pad');
  assert.equal(pad.length, 0, 'partial word should not match');
});

test('searchByAlias: transliteration variant resolves deterministically (Tier 1.5)', async () => {
  const results = await searchByAlias('kow soi');
  assert.equal(results.length, 1);
  assert.equal(results[0].nameEn, 'Khao soi');
  assert.equal(results[0].score, 1.0);
});

test('searchByAlias: alias goes through the one normalizer ("KOW-soi!" → hit)', async () => {
  const results = await searchByAlias('KOW-soi!');
  assert.equal(results.length, 1);
  assert.equal(results[0].nameEn, 'Khao soi');
});

test('searchByAlias: curated product alias ("green curry" → Gaeng keow wan)', async () => {
  const results = await searchByAlias('green curry');
  assert.equal(results.length, 1);
  assert.equal(results[0].nameEn, 'Gaeng keow wan');
});

test('searchByAlias: unknown text → empty, partial alias words → empty (equality only)', async () => {
  assert.equal((await searchByAlias('novel dish nobody catalogued')).length, 0);
  assert.equal((await searchByAlias('kow')).length, 0, 'partial alias must not match');
});

test('searchFullText: multi-word description recall ("coconut soup" → Tom kha)', async () => {
  const results = await searchFullText('coconut soup');
  assert.ok(results.length > 0, 'should find coconut-soup dishes');
  assert.ok(results.some((r) => r.nameEn?.includes('Tom kha')), 'Tom kha should match via description');
});

test('searchFullText: junk input does not throw', async () => {
  const results = await searchFullText('!!! spicy??');
  assert.ok(Array.isArray(results), 'should return array even for junk input');
});

test('searchFullText: name substring surfaces via the LIKE arm', async () => {
  const results = await searchFullText('pad');
  const padDishes = results.filter((r) => r.nameEn?.toLowerCase().includes('pad'));
  assert.ok(padDishes.length > 0, 'should find dishes with "pad" in name');
});

test('searchFullText: Thai script still answers in degraded mode (name_th LIKE arm)', async () => {
  // search_tsv covers only name_en + description, so Thai queries depend on the name_th arm.
  const results = await searchFullText('ส้มตำ');
  assert.ok(results.some((r) => r.nameTh === 'ส้มตำ'), 'Som tam must surface for its Thai name');
});

function vec(i: number) { const v = new Array(1536).fill(0.001); v[i % 1536] = 1; return v; }
