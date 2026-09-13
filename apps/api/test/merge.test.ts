import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCanonical, SOURCE_PRIORITY } from '../src/enrich/merge.ts';
import type { CanonicalPlace } from '../src/enrich/adapters/types.ts';

const base = (over: Partial<CanonicalPlace>): CanonicalPlace => ({
  googlePlaceId: 'ChIJx', source: 'google_places', name: null, lat: null, lng: null,
  hours: null, priceBand: null, fetchedAt: new Date('2026-07-04T00:00:00Z'), ...over,
});

test('SOURCE_PRIORITY ranks google_places first', () => {
  assert.equal(SOURCE_PRIORITY[0], 'google_places');
});

test('single input → passthrough', () => {
  const one = base({ name: 'Fixture Vegan Kitchen', lat: 13.7, _reviewTexts: ['r1'] });
  assert.deepEqual(mergeCanonical([one]), one);
});

test('two sources, same googlePlaceId: higher-priority non-null wins, lower fills the gaps', () => {
  const google = base({ name: 'Fixture Vegan Kitchen', lat: 13.7, lng: null, priceBand: 1,
    _editorialSummary: 'from google' });
  const osm = base({ source: 'osm', name: 'Fixture Vegan Kitchen (OSM)', lat: 13.9, lng: 100.5,
    hours: { mon: [{ open: '09:00', close: '21:00' }] } });
  const merged = mergeCanonical([osm, google]); // input order must not matter
  assert.equal(merged.name, 'Fixture Vegan Kitchen'); // conflict → higher priority wins
  assert.equal(merged.lat, 13.7);                     // conflict → higher priority wins
  assert.equal(merged.lng, 100.5);                    // gap in google → lower priority fills
  assert.deepEqual(merged.hours, { mon: [{ open: '09:00', close: '21:00' }] });
  assert.equal(merged.priceBand, 1);
  assert.equal(merged.source, 'google_places');       // provenance = winning source
  assert.equal(merged._editorialSummary, 'from google');
});

test('mixed googlePlaceIds refuse to merge', () => {
  assert.throws(() => mergeCanonical([base({}), base({ googlePlaceId: 'ChIJother' })]), /googlePlaceId/);
  assert.throws(() => mergeCanonical([]), /empty/);
});
