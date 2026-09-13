import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchQuery, dishResult, veganStatus,
  itineraryRequest, itineraryResponse, routeStep, timeOfDay,
  chatRequest, dishPlace,
  placeSearchIntent, placeSearchQuery, placeSearchResponse,
} from './domain.ts';

test('searchQuery defaults limit to 20', () => {
  assert.equal(searchQuery.parse({ q: 'tofu' }).limit, 20);
});
test('searchQuery rejects empty q', () => {
  assert.equal(searchQuery.safeParse({ q: '' }).success, false);
});
test('veganStatus rejects unknown', () => {
  assert.equal(veganStatus.safeParse('mostly').success, false);
});
test('dishResult requires score + places[]', () => {
  const r = dishResult.safeParse({ id: crypto.randomUUID(), nameEn: 'Som tam', nameTh: 'ส้มตำ',
    description: '', spiceLevel: 3, tags: [], orderPhrase: null, skipIngredients: null,
    regionName: 'Isaan', score: 0.8, places: [] });
  assert.equal(r.success, true);
});

// --- itinerary (plan 10) ---

const START = { start: { lat: 13.7563, lng: 100.5018 } };

test('itineraryRequest accepts start + preset; radius/maxStops stay unset for preset merge', () => {
  const r = itineraryRequest.parse({ ...START, presetId: 'street-food-crawl' });
  assert.equal(r.radiusM, undefined);
  assert.equal(r.maxStops, undefined);
});
test('itineraryRequest rejects when no intent (no presetId, text, or anchors)', () => {
  assert.equal(itineraryRequest.safeParse(START).success, false);
});
test('itineraryRequest accepts anchors-only intent', () => {
  const r = itineraryRequest.safeParse({ ...START, anchors: { placeIds: [crypto.randomUUID()] } });
  assert.equal(r.success, true);
});
test('itineraryRequest bounds priceBandMax (1-4) and spiceMax (0-5)', () => {
  assert.equal(itineraryRequest.safeParse({ ...START, text: 'soup', priceBandMax: 5 }).success, false);
  assert.equal(itineraryRequest.safeParse({ ...START, text: 'soup', spiceMax: 6 }).success, false);
  assert.equal(itineraryRequest.safeParse({ ...START, text: 'soup', priceBandMax: 2, spiceMax: 0 }).success, true);
});
test('routeStep and itineraryResponse shapes', () => {
  const step = { type: 'site', id: crypto.randomUUID(), name: 'The Grand Palace',
    nameTh: 'พระบรมมหาราชวัง', lat: 13.7501, lng: 100.492, order: 0 };
  assert.equal(routeStep.safeParse(step).success, true);
  assert.equal(itineraryResponse.safeParse({ steps: [step], narrative: null, degraded: 'embed' }).success, true);
  assert.equal(itineraryResponse.safeParse({ steps: [], narrative: 'x', degraded: 'total' }).success, false);
});
test('timeOfDay rejects unknown slot', () => {
  assert.equal(timeOfDay.safeParse('brunch').success, false);
});

// --- craving chat (spec 2026-07-11) ---

test('chatRequest bounds q and accepts optional location', () => {
  assert.equal(chatRequest.safeParse({ q: 'not spicy soup' }).success, true);
  assert.equal(chatRequest.safeParse({ q: '' }).success, false);
  assert.equal(chatRequest.safeParse({ q: 'x'.repeat(201) }).success, false);
  assert.equal(chatRequest.safeParse(
    { q: 'soup', location: { lat: 13.75, lng: 100.49 } }).success, true);
});

test('dishPlace accepts optional distanceM (chat annotates it)', () => {
  const base = { id: crypto.randomUUID(), name: 'Jae Oa', neighbourhood: 'Chinatown',
    verifiedVegan: true, lovedCount: 3 };
  assert.equal(dishPlace.safeParse(base).success, true);
  assert.equal(dishPlace.safeParse({ ...base, distanceM: 850 }).success, true);
});

// --- place search (spec 2026-07-27) ---

test('placeSearchIntent: valid intent parses; vegan literal true is enforced', () => {
  const intent = {
    intentType: 'nearby', entities: ['pad thai'], primaryLocation: 'Thonglor',
    isBestQuery: false, mode: null,
    hardFilters: { vegan: true, openNow: false, priceMax: null, exclude: [] },
    softPreferences: ['quiet'], semanticQuery: 'pad thai near thonglor', confidence: 0.9,
  };
  assert.deepEqual(placeSearchIntent.parse(intent), intent);
  assert.throws(() => placeSearchIntent.parse({
    ...intent, hardFilters: { ...intent.hardFilters, vegan: false },
  }));
});

test('placeSearchQuery: defaults limit, bounds lat/lng', () => {
  const q = placeSearchQuery.parse({ q: 'cafe' });
  assert.equal(q.limit, 20);
  assert.throws(() => placeSearchQuery.parse({ q: 'cafe', lat: 91, lng: 0 }));
});

test('placeSearchResponse: fallback shape', () => {
  const r = placeSearchResponse.parse({
    results: [], intent: placeSearchIntent.parse({
      intentType: 'discovery', entities: [], primaryLocation: null, isBestQuery: false,
      mode: null, hardFilters: { vegan: true, openNow: false, priceMax: null, exclude: [] },
      softPreferences: [], semanticQuery: 'x', confidence: 0.2,
    }), fallback: true, fallbackReason: 'low_confidence',
  });
  assert.equal(r.fallbackReason, 'low_confidence');
});
