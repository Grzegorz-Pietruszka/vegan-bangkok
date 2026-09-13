import { BANGKOK_AREAS } from '../areas';

// Rough Bangkok bounding box — every centroid must fall inside it.
const BKK = { latMin: 13.5, latMax: 14.0, lngMin: 100.3, lngMax: 100.9 };

test('BANGKOK_AREAS has unique ids and non-empty labels', () => {
  const ids = BANGKOK_AREAS.map((a) => a.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(BANGKOK_AREAS.every((a) => a.label.trim().length > 0)).toBe(true);
  expect(BANGKOK_AREAS.length).toBeGreaterThanOrEqual(6);
});

test('every area centroid sits inside the Bangkok bounding box', () => {
  for (const a of BANGKOK_AREAS) {
    expect(a.lat).toBeGreaterThanOrEqual(BKK.latMin);
    expect(a.lat).toBeLessThanOrEqual(BKK.latMax);
    expect(a.lng).toBeGreaterThanOrEqual(BKK.lngMin);
    expect(a.lng).toBeLessThanOrEqual(BKK.lngMax);
  }
});
