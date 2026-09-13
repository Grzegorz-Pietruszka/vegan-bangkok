import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql, eq, isNotNull } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { seedDatabase } from '../seed/seed.ts';
import { buildApp } from '../src/app.ts';
import { places, dishes, historicSites } from '../src/db/schema.ts';

const OLD_TOWN = { lat: 13.7515, lng: 100.492 };
const e = (i: number) => { const v = new Array(1536).fill(0); v[i] = 1; return v; };

let embedCalls = 0;
const embedSpy = async (texts: string[]) => { embedCalls += texts.length; return texts.map(() => e(0)); };
const narrateOk = async () => 'A grounded stroll through the old town.';

async function app(overrides: Record<string, unknown> = {}) {
  const a = await buildApp({ embedFn: embedSpy, narrateFn: narrateOk, ...overrides });
  after(() => a.close());
  return a;
}
const post = async (a: Awaited<ReturnType<typeof buildApp>>, payload: Record<string, unknown>) =>
  await a.inject({ method: 'POST', url: '/itinerary', payload });

before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes, historic_sites, query_embedding_cache RESTART IDENTITY CASCADE`);
  await seedDatabase(db);
});
after(() => pool.end());

test('preset request → ordered steps + narrative, no embed call', async () => {
  const a = await app();
  embedCalls = 0;
  const res = await post(a, { start: OLD_TOWN, presetId: 'temple-and-lunch' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.steps.length >= 1, 'no steps');
  assert.deepEqual(body.steps.map((s: any) => s.order), body.steps.map((_: any, i: number) => i));
  assert.equal(body.narrative, 'A grounded stroll through the old town.');
  assert.equal(embedCalls, 0, 'preset-only request must not embed');
});

test('free-text request embeds ONCE via the cache across two identical requests', async () => {
  const a = await app();
  embedCalls = 0;
  const r1 = await post(a, { start: OLD_TOWN, text: 'quiet temples then dessert' });
  assert.equal(r1.statusCode, 200);
  const r2 = await post(a, { start: OLD_TOWN, text: 'quiet temples then dessert' });
  assert.equal(r2.statusCode, 200);
  assert.equal(embedCalls, 1, `expected 1 embed call via cache, got ${embedCalls}`);
});

test('anchored request: place + dish anchors present, start is first order', async () => {
  const a = await app();
  const [p] = await db.select().from(places).where(isNotNull(places.lat)).limit(1);
  const [d] = await db.select().from(dishes).limit(1);
  const res = await post(a, {
    start: OLD_TOWN,
    text: 'greatest hits',
    anchors: { placeIds: [p.id], dishIds: [d.id] },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  const ids = body.steps.map((s: any) => s.id);
  assert.ok(ids.includes(p.id), 'place anchor missing');
  assert.ok(ids.includes(d.id), 'dish anchor missing');
  assert.equal(body.steps[0].order, 0);
});

test('every route includes at least one food stop (place or dish)', async () => {
  const a = await app();
  for (const presetId of ['temple-and-lunch', 'sunset', 'street-food-crawl']) {
    const res = await post(a, { start: OLD_TOWN, presetId });
    assert.equal(res.statusCode, 200, presetId);
    const types = res.json().steps.map((s: any) => s.type);
    assert.ok(types.some((t: string) => t !== 'site'), `${presetId}: sights-only walk, no food`);
  }
});

test('embedder throws → 200 with degraded:embed and a still-valid route', async () => {
  const boom = async () => { throw new Error('gemini down'); };
  const a = await app({ embedFn: boom });
  const res = await post(a, { start: OLD_TOWN, text: 'something romantic' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.degraded, 'embed');
  assert.ok(body.steps.length >= 1, 'degraded embed must still return a route');
});

test('narrator throws → 200 with degraded:narrative and a template narrative', async () => {
  const boomNarrate = async () => { throw new Error('gemini down'); };
  const a = await app({ narrateFn: boomNarrate });
  const res = await post(a, { start: OLD_TOWN, presetId: 'sunset' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.degraded, 'narrative');
  assert.ok(body.narrative, 'template narrative missing');
  assert.match(body.narrative, /-stop walk/);
});

test('no candidates → 200, empty steps, reason set', async () => {
  const a = await app();
  const res = await post(a, { start: { lat: 7.0, lng: 98.3 }, text: 'anything', radiusM: 200 });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body.steps, []);
  assert.ok(body.reason, 'reason missing');
});

test('request without any intent → 400 validation error', async () => {
  const a = await app();
  const res = await post(a, { start: OLD_TOWN });
  assert.equal(res.statusCode, 400);
});

test('walkMetersFromPrev present and plausible on every step', async () => {
  const a = await app();
  const res = await post(a, { start: OLD_TOWN, presetId: 'street-food-crawl' });
  for (const s of res.json().steps) {
    assert.ok(Number.isFinite(s.walkMetersFromPrev), `step ${s.order} missing walk distance`);
    assert.ok(s.walkMetersFromPrev >= 0 && s.walkMetersFromPrev < 20000);
  }
});
