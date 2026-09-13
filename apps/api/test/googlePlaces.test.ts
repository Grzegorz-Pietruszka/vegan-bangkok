import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { googlePlaces, type GooglePlaceRaw } from '../src/enrich/adapters/googlePlaces.ts';
import { PERSISTED_FACT_KEYS } from '../src/enrich/adapters/types.ts';
import fixture from './fixtures/google-place.json' with { type: 'json' };

const raw = fixture as GooglePlaceRaw;

test('toCanonical maps id/displayName/location/priceLevel to fact fields', () => {
  const c = googlePlaces.toCanonical(raw);
  assert.equal(c.googlePlaceId, 'ChIJTESTFIXTURExxxxxxxxxxxx');
  assert.equal(c.source, 'google_places');
  assert.equal(c.name, 'Fixture Vegan Kitchen');
  assert.equal(c.lat, 13.7201);
  assert.equal(c.lng, 100.5602);
  assert.equal(c.priceBand, 1); // PRICE_LEVEL_INEXPENSIVE → 1
});

test('priceLevel enum maps across the whole 1–4 band; unknown/absent → null', () => {
  const at = (priceLevel?: string) => googlePlaces.toCanonical({ ...raw, priceLevel }).priceBand;
  assert.equal(at('PRICE_LEVEL_INEXPENSIVE'), 1);
  assert.equal(at('PRICE_LEVEL_MODERATE'), 2);
  assert.equal(at('PRICE_LEVEL_EXPENSIVE'), 3);
  assert.equal(at('PRICE_LEVEL_VERY_EXPENSIVE'), 4);
  assert.equal(at('PRICE_LEVEL_UNSPECIFIED'), null);
  assert.equal(at(undefined), null);
});

test('regularOpeningHours periods → per-day hours in the seed shape (multi-period day kept)', () => {
  const c = googlePlaces.toCanonical(raw);
  assert.deepEqual(c.hours, {
    mon: [{ open: '09:00', close: '21:30' }],
    tue: [{ open: '09:00', close: '21:30' }],
    sat: [{ open: '10:00', close: '15:00' }, { open: '17:00', close: '22:00' }],
  });
  const noHours = googlePlaces.toCanonical({ ...raw, regularOpeningHours: undefined });
  assert.equal(noHours.hours, null);
});

test('editorialSummary + review texts land ONLY on transient _ fields, never among persisted facts', () => {
  const c = googlePlaces.toCanonical(raw);
  assert.match(c._editorialSummary ?? '', /plant-filled shophouse/);
  assert.deepEqual(c._reviewTexts, [
    'The khao soi here is fully vegan and the owner explains every ingredient.',
    'Quiet on weekday mornings, gets busy after office hours.',
  ]); // review 3 has no text — dropped
  // ToS guard: no transient key is a persisted fact key, and no raw Google prose
  // appears anywhere in the persisted-fact projection.
  assert.ok(!PERSISTED_FACT_KEYS.includes('_editorialSummary' as never));
  assert.ok(!PERSISTED_FACT_KEYS.includes('_reviewTexts' as never));
  const persisted = JSON.stringify(Object.fromEntries(PERSISTED_FACT_KEYS.map((k) => [k, c[k]])));
  assert.doesNotMatch(persisted, /shophouse|khao soi here/);
});

test('businessStatus closed → flagged skip (both closed variants); OPERATIONAL not flagged', () => {
  assert.equal(googlePlaces.toCanonical(raw)._closed, undefined);
  assert.equal(googlePlaces.toCanonical({ ...raw, businessStatus: 'CLOSED_PERMANENTLY' })._closed, true);
  assert.equal(googlePlaces.toCanonical({ ...raw, businessStatus: 'CLOSED_TEMPORARILY' })._closed, true);
});

afterEach(() => mock.restoreAll());

test('fetch: 404 → null (not-found is data, not an error)', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('{"error":{"status":"NOT_FOUND"}}', { status: 404 }));
  assert.equal(await googlePlaces.fetch('ChIJnope'), null);
});

test('fetch: sends the tight FieldMask and returns the payload; non-404 error throws', async () => {
  const calls: any[] = [];
  const m = mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(raw), { status: 200 });
  });
  const got = await googlePlaces.fetch('ChIJTESTFIXTURExxxxxxxxxxxx');
  assert.equal(got?.id, raw.id);
  assert.match(calls[0].url, /places\.googleapis\.com\/v1\/places\/ChIJTESTFIXTURExxxxxxxxxxxx/);
  assert.equal(calls[0].init.headers['X-Goog-FieldMask'],
    'id,displayName,location,regularOpeningHours,priceLevel,businessStatus,editorialSummary,reviews');

  m.mock.mockImplementation(async () => new Response('quota', { status: 429 }));
  await assert.rejects(() => googlePlaces.fetch('ChIJTESTFIXTURExxxxxxxxxxxx'), /429/);
});
