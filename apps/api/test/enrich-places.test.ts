import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql, eq, isNotNull } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { places } from '../src/db/schema.ts';
import { enrichPlaces } from '../src/enrich/run.ts';
import { googlePlaces, type GooglePlaceRaw } from '../src/enrich/adapters/googlePlaces.ts';
import type { SourceAdapter, CanonicalPlace } from '../src/enrich/adapters/types.ts';
import type { DerivedPlace } from '../src/enrich/derive.ts';
import fixture from './fixtures/google-place.json' with { type: 'json' };

after(() => pool.end());
beforeEach(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes RESTART IDENTITY CASCADE`);
});

// Mock adapter: fixture-backed fetch, REAL toCanonical (the mapping stays exercised).
function mockAdapter(ids: string[], opts: { closed?: string[] } = {}) {
  const fetchCalls: string[] = [];
  const raws = new Map<string, GooglePlaceRaw>(ids.map((id) => [id, {
    ...(fixture as GooglePlaceRaw),
    id,
    displayName: { text: `Fixture Place ${id}` },
    ...(opts.closed?.includes(id) ? { businessStatus: 'CLOSED_PERMANENTLY' } : {}),
  }]));
  const adapter: SourceAdapter<string, GooglePlaceRaw> = {
    source: 'google_places',
    fetch: async (id) => { fetchCalls.push(id); return raws.get(id) ?? null; },
    toCanonical: googlePlaces.toCanonical,
  };
  return { adapter, fetchCalls };
}

// Mock derive (the "mocked Gemini"): spy + optional per-id failure.
function mockDerive(failFor: Set<string> = new Set()) {
  const calls: string[] = [];
  const derive = async (m: CanonicalPlace): Promise<DerivedPlace> => {
    calls.push(m.googlePlaceId);
    if (failFor.has(m.googlePlaceId)) throw new Error('generate quota blown');
    return {
      summary: `Derived summary for ${m.name}.`, vibeTags: ['quiet'],
      embeddingInput: `${m.name}\nDerived summary for ${m.name}.`,
      embedding: Array(1536).fill(0.02), embeddingModel: 'gemini-embedding-001',
      deriveComplete: true,
    };
  };
  return { derive, calls };
}

test('happy path: all ids enriched, counts correct, rows fully populated', async () => {
  const { adapter } = mockAdapter(['ChIJa', 'ChIJb']);
  const { derive } = mockDerive();
  const summary = await enrichPlaces(['ChIJa', 'ChIJb'], {}, { adapter, derive, db, delayMs: 0 });
  assert.deepEqual(summary, { enriched: 2, partial: 0, notFound: 0, skipped: 0, failed: 0, aborted: false });

  const rows = await db.select().from(places).where(isNotNull(places.googlePlaceId));
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.match(r.summary ?? '', /Derived summary/);
    assert.deepEqual(r.vibeTags, ['quiet']);
    assert.equal(r.embedding?.length, 1536);
    assert.equal(r.source, 'google_places');
    assert.ok(r.fetchedAt && r.enrichedAt);
    assert.equal(r.venueType, null); // reserved in v1
  }
});

test('idempotent re-run: already-enriched ids are skipped, derive called 0 times, no fetch', async () => {
  const { adapter } = mockAdapter(['ChIJa', 'ChIJb']);
  const first = mockDerive();
  await enrichPlaces(['ChIJa', 'ChIJb'], {}, { adapter, derive: first.derive, db, delayMs: 0 });

  const second = mockDerive();
  const rerun = mockAdapter(['ChIJa', 'ChIJb']);
  const summary = await enrichPlaces(['ChIJa', 'ChIJb'], {}, { adapter: rerun.adapter, derive: second.derive, db, delayMs: 0 });
  assert.equal(second.calls.length, 0);
  assert.equal(rerun.fetchCalls.length, 0); // skip check happens BEFORE spending quota
  assert.equal(summary.skipped, 2);
  const rows = await db.select().from(places);
  assert.equal(rows.length, 2); // one row per place after two runs
});

test('--force re-derives already-enriched rows', async () => {
  const { adapter } = mockAdapter(['ChIJa']);
  await enrichPlaces(['ChIJa'], {}, { adapter, derive: mockDerive().derive, db, delayMs: 0 });
  const again = mockDerive();
  const summary = await enrichPlaces(['ChIJa'], { force: true }, { adapter, derive: again.derive, db, delayMs: 0 });
  assert.equal(again.calls.length, 1);
  assert.equal(summary.enriched, 1);
});

test('not-found id: counted, no row churn', async () => {
  const { adapter } = mockAdapter(['ChIJa']); // ChIJghost not in the map → fetch null
  const summary = await enrichPlaces(['ChIJa', 'ChIJghost'], {}, { adapter, derive: mockDerive().derive, db, delayMs: 0 });
  assert.equal(summary.notFound, 1);
  assert.equal(summary.enriched, 1);
  assert.equal((await db.select().from(places)).length, 1);
});

test('closed venue: skipped, nothing persisted', async () => {
  const { adapter } = mockAdapter(['ChIJa', 'ChIJgone'], { closed: ['ChIJgone'] });
  const summary = await enrichPlaces(['ChIJa', 'ChIJgone'], {}, { adapter, derive: mockDerive().derive, db, delayMs: 0 });
  assert.equal(summary.skipped, 1);
  assert.equal((await db.select().from(places)).length, 1);
});

test('failure recovery: derive throws for one id → partial row; next normal run completes it', async () => {
  const { adapter } = mockAdapter(['ChIJa', 'ChIJb']);
  const failing = mockDerive(new Set(['ChIJb']));
  const s1 = await enrichPlaces(['ChIJa', 'ChIJb'], {}, { adapter, derive: failing.derive, db, delayMs: 0 });
  assert.equal(s1.enriched, 1);
  assert.equal(s1.partial, 1);
  assert.equal(s1.aborted, false);
  const [b] = await db.select().from(places).where(eq(places.googlePlaceId, 'ChIJb'));
  assert.equal(b.name, 'Fixture Place ChIJb'); // facts saved
  assert.equal(b.enrichedAt, null);            // enrichment pending

  const healthy = mockDerive();
  const s2 = await enrichPlaces(['ChIJa', 'ChIJb'], {}, { adapter, derive: healthy.derive, db, delayMs: 0 });
  assert.deepEqual(healthy.calls, ['ChIJb']);  // only the partial row re-derived
  assert.equal(s2.enriched, 1);
  assert.equal(s2.skipped, 1);
  const [b2] = await db.select().from(places).where(eq(places.googlePlaceId, 'ChIJb'));
  assert.ok(b2.enrichedAt && b2.summary);
  assert.equal((await db.select().from(places)).length, 2);
});

test('hard-stop: repeated failures abort the run instead of burning the whole list', async () => {
  const ids = ['ChIJ1', 'ChIJ2', 'ChIJ3', 'ChIJ4', 'ChIJ5'];
  const { adapter, fetchCalls } = mockAdapter(ids);
  const allFail = mockDerive(new Set(ids));
  const summary = await enrichPlaces(ids, {}, { adapter, derive: allFail.derive, db, delayMs: 0 });
  assert.equal(summary.aborted, true);
  assert.equal(fetchCalls.length, 3);   // 3 consecutive failures → stop, 2 ids untouched
  assert.equal(summary.partial, 3);
});

test('limit slices the id list', async () => {
  const { adapter, fetchCalls } = mockAdapter(['ChIJa', 'ChIJb', 'ChIJc']);
  const summary = await enrichPlaces(['ChIJa', 'ChIJb', 'ChIJc'], { limit: 2 }, { adapter, derive: mockDerive().derive, db, delayMs: 0 });
  assert.equal(summary.enriched, 2);
  assert.equal(fetchCalls.length, 2);
});
