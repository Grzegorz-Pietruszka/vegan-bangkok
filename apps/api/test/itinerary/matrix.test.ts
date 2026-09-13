import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineM, buildCostMatrix, HaversineProvider, DEFAULT_WEIGHTS } from '../../src/itinerary/matrix.ts';

// Hand-computed on R=6371000: 0.01° of latitude = 2πR/36000 = 1111.949 m.
// 0.01° of longitude at lat 13.75° = 1111.949 × cos(13.75°) = 1080.08 m.
test('haversineM matches hand-computed Bangkok distances', () => {
  const d1 = haversineM({ lat: 13.75, lng: 100.49 }, { lat: 13.76, lng: 100.49 });
  assert.ok(Math.abs(d1 - 1111.95) < 1, `lat step: got ${d1}`);
  const d2 = haversineM({ lat: 13.75, lng: 100.49 }, { lat: 13.75, lng: 100.50 });
  assert.ok(Math.abs(d2 - 1080.08) < 1, `lng step: got ${d2}`);
});

test('distance is symmetric', () => {
  const a = { lat: 13.7501, lng: 100.492 }, b = { lat: 13.7437, lng: 100.4889 };
  assert.equal(haversineM(a, b), haversineM(b, a));
});

test('cost cell = distance − destination vibe bonus; self cell is Infinity', () => {
  const cands = [
    { lat: 13.75, lng: 100.49, vibeScore: 0 },
    { lat: 13.76, lng: 100.49, vibeScore: 0.5 },
  ];
  const m = buildCostMatrix(cands, HaversineProvider, { vibeBonusM: 300 });
  // hand-worked: 1111.949 − 0.5×300 = 961.949 toward b; 1111.949 − 0 back toward a
  assert.ok(Math.abs(m[0][1] - 961.95) < 1, `got ${m[0][1]}`);
  assert.ok(Math.abs(m[1][0] - 1111.95) < 1, `got ${m[1][0]}`);
  assert.equal(m[0][0], Infinity);
  assert.equal(m[1][1], Infinity);
});

test('default weights export exists (tunable consts, not config)', () => {
  assert.ok(DEFAULT_WEIGHTS.vibeBonusM > 0);
});
