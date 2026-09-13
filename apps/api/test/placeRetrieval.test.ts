import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { seedDatabase } from '../seed/seed.ts';
import { placeSearchIntent } from '@vegan-bangkok/schemas';
import {
  hardFilterClause, resolveGeo, geoArm, lexicalArm, fallbackQuery, hydratePlaces,
  findEntityMatches,
} from '../src/search/placeRetrieval.ts';

const intent = (over: object = {}) => placeSearchIntent.parse({
  intentType: 'discovery', entities: [], primaryLocation: null, isBestQuery: false, mode: null,
  hardFilters: { vegan: true, openNow: false, priceMax: null, exclude: [] },
  softPreferences: [], semanticQuery: 'vegan cafe', confidence: 0.9, ...over,
});

before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes, query_embedding_cache RESTART IDENTITY CASCADE`);
  await seedDatabase(db);
  // adversarial row: non-vegan place in Thonglor — must NEVER surface
  await db.execute(sql`
    INSERT INTO places (name, neighbourhood, lat, lng, vegan_status, summary)
    VALUES ('Steak Palace Thonglor', 'Thonglor', 13.7263, 100.5782, NULL, 'vegan cafe vibes but serves steak')`);
});
after(() => pool.end());

test('HARD FILTER: null vegan_status place never appears in any arm or fallback', async () => {
  const i = intent({ primaryLocation: 'Thonglor', semanticQuery: 'steak palace vegan cafe' });
  const geo = resolveGeo(i);
  const ids = [
    ...(await geoArm(i, geo!)),
    ...(await lexicalArm(i)),
    ...(await fallbackQuery(i, geo, 50)),
  ].map((r) => r.id);
  const { rows } = await db.execute(sql`SELECT id FROM places WHERE name = 'Steak Palace Thonglor'`);
  assert.ok(!ids.includes((rows[0] as any).id), 'non-vegan place leaked through retrieval');
});

test('geoArm: only places within radius, scored by proximity', async () => {
  const i = intent({ primaryLocation: 'Thonglor' });
  const geo = resolveGeo(i);
  assert.ok(geo && geo.radiusM === 1500);
  const res = await geoArm(i, geo);
  assert.ok(res.length > 0);
  assert.ok(res.every((r) => r.score >= 0 && r.score <= 1));
  const hydrated = await hydratePlaces(res, geo);
  assert.ok(hydrated.every((h) => (h.distanceM ?? Infinity) <= 1500));
});

test('lexicalArm: finds place by name words', async () => {
  const i = intent({ semanticQuery: 'broccoli revolution' });
  const res = await lexicalArm(i);
  const hydrated = await hydratePlaces(res, null);
  assert.ok(hydrated.some((h) => h.name === 'Broccoli Revolution'));
});

test('priceMax filter constrains all arms', async () => {
  const i = intent({ hardFilters: { vegan: true, openNow: false, priceMax: 1, exclude: [] } });
  const res = await lexicalArm(i);
  const hydrated = await hydratePlaces(res, null);
  assert.ok(hydrated.every((h) => h.priceBand === null || h.priceBand <= 1));
});

test('openNow: place open mon 09:00-15:00 matches at mon 10:00, not mon 16:00', async () => {
  const i = intent({ hardFilters: { vegan: true, openNow: true, priceMax: null, exclude: [] }, semanticQuery: 'jae oa' });
  const at = (time: string) => db.execute(sql`
    SELECT count(*)::int AS n FROM places p
    WHERE p.name = 'Jae Oa Vegetarian' AND ${hardFilterClause(i, { day: 'mon', time })}`);
  assert.equal(((await at('10:00')).rows[0] as any).n, 1);
  assert.equal(((await at('16:00')).rows[0] as any).n, 0);
});

test('fallbackQuery: citywide popular vegan places, never empty on seeded DB', async () => {
  const res = await fallbackQuery(intent(), null, 20);
  assert.ok(res.length > 0);
});

test('findEntityMatches: finds "pad thai" inside a longer query', async () => {
  const m = await findEntityMatches('best pad thai in Thonglor');
  assert.ok(m.includes('pad thai'));
});
