import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql, eq } from 'drizzle-orm';
import { db, pool } from '../../src/db/index.ts';
import { seedDatabase } from '../../seed/seed.ts';
import { places, dishes, historicSites } from '../../src/db/schema.ts';
import { buildShortlist } from '../../src/itinerary/shortlist.ts';

// 2026-07-13 = a Monday. Jae Oa Vegetarian (Chinatown): mon 09:00–15:00.
const MONDAY_NOON_ICT = new Date('2026-07-13T05:00:00Z');    // 12:00 Asia/Bangkok
const CHINATOWN = { lat: 13.7405, lng: 100.5095 };
const OLD_TOWN = { lat: 13.7515, lng: 100.492 };

const fakeEmbed = (vec: number[]) => async (_: string) => vec;
const e = (i: number) => { const v = new Array(1536).fill(0); v[i] = 1; return v; };

function intent(over: Record<string, unknown> = {}) {
  return {
    start: OLD_TOWN, vibeTags: [] as string[], radiusM: 2500,
    anchors: { placeIds: [], siteIds: [], dishIds: [] },
    ...over,
  };
}
const deps = (embed = fakeEmbed(e(0))) => ({ db, embed, now: MONDAY_NOON_ICT });

before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes, historic_sites RESTART IDENTITY CASCADE`);
  await seedDatabase(db);
});
after(() => pool.end());

test('geo radius filter drops far candidates (non-anchors)', async () => {
  const { candidates } = await buildShortlist(intent({ text: 'anything', radiusM: 500 }), deps());
  assert.ok(candidates.length > 0);
  for (const c of candidates) assert.ok(c.distanceM <= 500, `${c.name} at ${c.distanceM}m`);
});

test('shortlist mixes places and historic sites, capped at 12', async () => {
  const { candidates } = await buildShortlist(intent({ text: 'temples' }), deps());
  assert.ok(candidates.length <= 12);
  assert.ok(candidates.some((c) => c.type === 'site'), 'no historic site in old-town shortlist');
  assert.ok(candidates.some((c) => c.type === 'place'), 'no place in shortlist');
});

test('open-at-time filter drops closed places, keeps them when open', async () => {
  const day = await buildShortlist(
    intent({ start: CHINATOWN, text: 'lunch', timeOfDay: 'daytime', radiusM: 800 }), deps());
  assert.ok(day.candidates.some((c) => c.name === 'Jae Oa Vegetarian'), 'open place missing at noon');
  const night = await buildShortlist(
    intent({ start: CHINATOWN, text: 'dinner', timeOfDay: 'evening', radiusM: 800 }), deps());
  assert.ok(!night.candidates.some((c) => c.name === 'Jae Oa Vegetarian'), 'closed place kept at 20:00');
});

test('priceBandMax hard-filters places', async () => {
  const { candidates } = await buildShortlist(intent({ text: 'cheap eats', priceBandMax: 1 }), deps());
  for (const c of candidates) {
    if (c.type === 'place') assert.ok((c.priceBand ?? 1) <= 1, `${c.name} band ${c.priceBand}`);
  }
});

test('anchors force in a place outside radius AND over priceBandMax', async () => {
  const [far] = (await db.select().from(places).where(eq(places.priceBand, 4))).slice(0, 1)
    .concat(await db.select().from(places).where(eq(places.priceBand, 3)));
  assert.ok(far, 'seed needs a priceBand 3-4 place');
  const { candidates } = await buildShortlist(
    intent({ text: 'x', radiusM: 200, priceBandMax: 1, anchors: { placeIds: [far.id], siteIds: [], dishIds: [] } }),
    deps());
  const hit = candidates.find((c) => c.id === far.id);
  assert.ok(hit, 'anchor dropped by filters');
  assert.equal(hit!.anchor, true);
});

test('dish anchor resolves to a serving place with coords', async () => {
  const [d] = await db.select().from(dishes).limit(1);
  const { candidates } = await buildShortlist(
    intent({ text: 'x', anchors: { placeIds: [], siteIds: [], dishIds: [d.id] } }), deps());
  const hit = candidates.find((c) => c.type === 'dish');
  assert.ok(hit, 'dish anchor missing');
  assert.ok(hit!.lat && hit!.lng, 'dish anchor has no coords');
});

test('semantic ordering: cosine to the query ranks candidates (mocked embedder)', async () => {
  const rows = await db.select().from(historicSites).limit(2);
  await db.update(historicSites).set({ embedding: e(0) }).where(eq(historicSites.id, rows[0].id));
  await db.update(historicSites).set({ embedding: e(1) }).where(eq(historicSites.id, rows[1].id));
  const { candidates, degraded } = await buildShortlist(intent({ text: 'royal palace' }), deps(fakeEmbed(e(0))));
  assert.equal(degraded, false);
  const i0 = candidates.findIndex((c) => c.id === rows[0].id);
  const i1 = candidates.findIndex((c) => c.id === rows[1].id);
  assert.ok(i0 !== -1, 'embedded site missing');
  assert.ok(i1 === -1 || i0 < i1, `cos=1 site ranked below cos=0 site (${i0} vs ${i1})`);
});

test('degraded path: embedder throws → vibe-overlap ordering, no throw', async () => {
  const boom = async () => { throw new Error('gemini down'); };
  const { candidates, degraded } = await buildShortlist(
    intent({ text: 'romantic sunset', vibeTags: ['sunset', 'scenic-view'] }), deps(boom));
  assert.equal(degraded, true);
  assert.ok(candidates.length > 0, 'degraded mode returned nothing');
  const withVibe = candidates.filter((c) => c.vibeScore > 0);
  assert.ok(withVibe.length > 0, 'no vibe-overlap candidates found');
  assert.ok(candidates[0].vibeScore >= candidates[candidates.length - 1].vibeScore,
    'not ordered by vibe overlap');
});
