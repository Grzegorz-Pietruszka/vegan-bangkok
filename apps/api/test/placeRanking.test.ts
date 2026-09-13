import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankPlaces, type RankCandidate } from '../src/search/placeRanking.ts';
import { placeSearchIntent } from '@vegan-bangkok/schemas';

const baseIntent = placeSearchIntent.parse({
  intentType: 'discovery', entities: [], primaryLocation: null, isBestQuery: false, mode: null,
  hardFilters: { vegan: true, openNow: false, priceMax: null, exclude: [] },
  softPreferences: [], semanticQuery: 'q', confidence: 0.9,
});

const cands: RankCandidate[] = [
  { id: 'famous',  rrf: 0.03, distanceM: 500,  lovedCount: 500, vibeTags: ['bustling'] },
  { id: 'obscure', rrf: 0.03, distanceM: 500,  lovedCount: 2,   vibeTags: ['quiet', 'hidden-gem'] },
];

test('best mode: famous wins', () => {
  const r = rankPlaces(cands, { ...baseIntent, intentType: 'best', isBestQuery: true }, 2000);
  assert.equal(r[0].id, 'famous');
});

test('hidden_gems mode: obscure wins (popularity inverted)', () => {
  const r = rankPlaces(cands, { ...baseIntent, mode: 'hidden_gems' }, 2000);
  assert.equal(r[0].id, 'obscure');
});

test('vibe overlap lifts matching place', () => {
  const r = rankPlaces(cands, { ...baseIntent, softPreferences: ['quiet'] }, 2000);
  assert.equal(r[0].id, 'obscure');
});

test('nearby: closer place wins at equal rrf/popularity', () => {
  const c: RankCandidate[] = [
    { id: 'far',  rrf: 0.03, distanceM: 1900, lovedCount: 10, vibeTags: [] },
    { id: 'near', rrf: 0.03, distanceM: 100,  lovedCount: 10, vibeTags: [] },
  ];
  const r = rankPlaces(c, { ...baseIntent, intentType: 'nearby' }, 2000);
  assert.equal(r[0].id, 'near');
});
