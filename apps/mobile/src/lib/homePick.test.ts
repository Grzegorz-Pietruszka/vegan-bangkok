import { pickTonightsDish } from './homePick';

const dishes = [
  { id: 'a', nameEn: 'A', places: [] },
  { id: 'b', nameEn: 'B', places: [{ name: 'X', verifiedVegan: true, lovedCount: 1 }] },
  { id: 'c', nameEn: 'C', places: [{ name: 'Y', verifiedVegan: false, lovedCount: 0 }] },
  { id: 'd', nameEn: 'D', places: [{ name: 'Z', verifiedVegan: true, lovedCount: 5 }] },
] as never[];

describe('pickTonightsDish()', () => {
  it('prefers dishes with a verified place', () => {
    const pick = pickTonightsDish(dishes, new Date('2026-07-03'));
    expect(['b', 'd']).toContain((pick as { id: string }).id);
  });
  it('is deterministic for a given date and rotates across days', () => {
    const d1 = pickTonightsDish(dishes, new Date('2026-07-03'));
    const d1again = pickTonightsDish(dishes, new Date('2026-07-03'));
    const d2 = pickTonightsDish(dishes, new Date('2026-07-04'));
    expect(d1).toEqual(d1again);
    expect(d1).not.toEqual(d2); // 2 verified candidates → consecutive days differ
  });
  it('falls back to any dish when none are verified', () => {
    const none = [{ id: 'a', nameEn: 'A', places: [] }] as never[];
    expect((pickTonightsDish(none, new Date()) as { id: string }).id).toBe('a');
  });
  it('returns null for an empty catalog', () => {
    expect(pickTonightsDish([], new Date())).toBeNull();
  });
});
