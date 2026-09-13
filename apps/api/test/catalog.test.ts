import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql, eq } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { places } from '../src/db/schema.ts';
import { upsertPlace, setDerived } from '../src/catalog/places.ts';
import type { CanonicalPlace } from '../src/enrich/adapters/types.ts';
import type { DerivedPlace } from '../src/enrich/derive.ts';

before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes RESTART IDENTITY CASCADE`);
});
after(() => pool.end());

const facts = (over: Partial<CanonicalPlace> = {}): CanonicalPlace => ({
  googlePlaceId: 'ChIJfixture1', source: 'google_places', name: 'Fixture Vegan Kitchen',
  lat: 13.7201, lng: 100.5602, hours: { mon: [{ open: '09:00', close: '21:30' }] },
  priceBand: 1, fetchedAt: new Date('2026-07-04T10:00:00Z'), ...over,
});

const derived = (over: Partial<DerivedPlace> = {}): DerivedPlace => ({
  summary: 'A quiet tofu-curry shophouse.', vibeTags: ['quiet'],
  embeddingInput: 'Fixture Vegan Kitchen\nA quiet tofu-curry shophouse.\nquiet',
  embedding: Array(1536).fill(0.01), embeddingModel: 'gemini-embedding-001',
  deriveComplete: true, ...over,
});

test('upsertPlace twice with same googlePlaceId → one row, second call updates', async () => {
  await upsertPlace(facts());
  await upsertPlace(facts({ name: 'Fixture Vegan Kitchen 2', priceBand: 2 }));
  const rows = await db.select().from(places).where(eq(places.googlePlaceId, 'ChIJfixture1'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Fixture Vegan Kitchen 2');
  assert.equal(rows[0].priceBand, 2);
  assert.equal(rows[0].source, 'google_places');
  assert.ok(rows[0].fetchedAt);
});

test('partial-safe: upsertPlace alone leaves enrichedAt and summary null', async () => {
  const [row] = await db.select().from(places).where(eq(places.googlePlaceId, 'ChIJfixture1'));
  assert.equal(row.enrichedAt, null);
  assert.equal(row.summary, null);
  assert.equal(row.embedding, null);
});

test('upsertPlace claims a curated seed row by normalized name (no duplicate place)', async () => {
  // Seed rows are hand-curated and have no googlePlaceId — the bootstrap must enrich
  // them in place, not insert a Google twin next to them.
  await db.insert(places).values({
    name: 'May Veggie Home', neighbourhood: 'Asok', veganStatus: 'fully_vegan',
  });
  await upsertPlace(facts({ googlePlaceId: 'ChIJmay', name: 'MAY Veggie Home!', lat: 13.73, lng: 100.56 }));
  const rows = await db.select().from(places)
    .where(sql`${places.name} ILIKE '%veggie home%'`);
  assert.equal(rows.length, 1, 'must claim the curated row, not duplicate it');
  assert.equal(rows[0].googlePlaceId, 'ChIJmay');
  assert.equal(rows[0].neighbourhood, 'Asok');        // curated fields preserved
  assert.equal(rows[0].veganStatus, 'fully_vegan');
  assert.equal(rows[0].lat, 13.73);                   // facts filled in
});

test('setDerived writes summary/vibeTags/embedding* and stamps enrichedAt', async () => {
  await setDerived('ChIJfixture1', derived());
  const [row] = await db.select().from(places).where(eq(places.googlePlaceId, 'ChIJfixture1'));
  assert.equal(row.summary, 'A quiet tofu-curry shophouse.');
  assert.deepEqual(row.vibeTags, ['quiet']);
  assert.equal(row.embedding?.length, 1536);
  assert.equal(row.embeddingModel, 'gemini-embedding-001');
  assert.match(row.embeddingInput ?? '', /Fixture Vegan Kitchen/);
  assert.ok(row.embeddedAt instanceof Date);
  assert.ok(row.enrichedAt instanceof Date);
});

test('re-upsert after enrichment does NOT clobber derived fields', async () => {
  // partial-recovery re-runs re-fetch facts before re-deriving — facts refresh
  // must never null out an existing enrichment.
  await upsertPlace(facts({ priceBand: 3 }));
  const [row] = await db.select().from(places).where(eq(places.googlePlaceId, 'ChIJfixture1'));
  assert.equal(row.priceBand, 3);
  assert.equal(row.summary, 'A quiet tofu-curry shophouse.');
  assert.ok(row.enrichedAt);
});

test('defense-in-depth: setDerived rejects an off-vocab tag (does not trust caller)', async () => {
  await assert.rejects(
    () => setDerived('ChIJfixture1', derived({ vibeTags: ['quiet', 'made-up-vibe'] as never })),
    /made-up-vibe/);
});

test('setDerived on an unknown googlePlaceId throws instead of silently writing nothing', async () => {
  await assert.rejects(() => setDerived('ChIJnope', derived()), /ChIJnope/);
});

test('upsertPlace without a name for a brand-new place throws (name is NOT NULL)', async () => {
  await assert.rejects(() => upsertPlace(facts({ googlePlaceId: 'ChIJnew', name: null })), /name/);
});
