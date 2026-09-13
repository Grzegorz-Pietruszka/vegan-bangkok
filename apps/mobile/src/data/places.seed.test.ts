import { place } from '@vegan-bangkok/schemas';
import placesJson from '../../assets/data/places.json';

describe('bundled catalog seed', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(placesJson)).toBe(true);
    expect(placesJson.length).toBeGreaterThan(0);
  });
  it('every entry parses against the shared Place schema', () => {
    for (const p of placesJson as unknown[]) {
      const r = place.safeParse(p);
      if (!r.success) throw new Error(JSON.stringify(r.error.issues));
      expect(r.success).toBe(true);
    }
  });
  it('marks at least one entry verified (else every M5 map pin renders community-yellow)', () => {
    const seed = placesJson as Array<{ verified?: boolean }>;
    expect(seed.some((p) => p.verified === true)).toBe(true);
  });
});
