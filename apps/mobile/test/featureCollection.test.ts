import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlacesFeatureCollection } from '../src/map/featureCollection.ts';

const base = { neighbourhood: 'X', veganStatus: 'fully_vegan', priceBand: 1,
  hours: {}, nearestStation: null, photoUrl: null } as const;

test('one Point feature per place, in [lng, lat] order', () => {
  const fc = buildPlacesFeatureCollection([{ id: 'a', name: 'A', lat: 13.75, lng: 100.5, ...base }] as any);
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 1);
  assert.deepEqual(fc.features[0].geometry.coordinates, [100.5, 13.75]); // lng first!
});
test('encodes trust as numeric 0/1; absent verified => community', () => {
  const fc = buildPlacesFeatureCollection([
    { id: 'v', name: 'V', lat: 13.7, lng: 100.5, verified: true, ...base },
    { id: 'c', name: 'C', lat: 13.7, lng: 100.6, ...base },
  ] as any);
  assert.equal(fc.features[0].properties.verified, 1);
  assert.equal(fc.features[1].properties.verified, 0);
});
test('drops places with non-finite coordinates', () => {
  const fc = buildPlacesFeatureCollection([{ id: 'bad', name: 'B', lat: NaN, lng: 100.5, ...base }] as any);
  assert.equal(fc.features.length, 0);
});
