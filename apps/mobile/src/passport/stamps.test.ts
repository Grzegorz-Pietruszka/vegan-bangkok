import AsyncStorage from '@react-native-async-storage/async-storage';
import { addStamp, loadStamps, computeProgress, earnedByDish, type Stamp } from './stamps';

beforeEach(() => AsyncStorage.clear());

describe('stamps store', () => {
  it('addStamp writes the server-mirroring shape', async () => {
    await addStamp('dish-1', 'place-1');
    const [s] = await loadStamps();
    expect(s.dish_id).toBe('dish-1');
    expect(s.place_id).toBe('place-1');
    expect(typeof s.id).toBe('string');
    expect(new Date(s.eaten_at).getTime()).not.toBeNaN();
  });
  it('is idempotent per dish — one stamp per dish_id', async () => {
    await addStamp('dish-1');
    await addStamp('dish-1');
    expect(await loadStamps()).toHaveLength(1);
  });
});

describe('computeProgress()', () => {
  const stamp = (d: string): Stamp => ({ id: d, dish_id: d, eaten_at: '2026-07-03T00:00:00Z' });
  it('counts only collection dishes', () => {
    const p = computeProgress([stamp('a'), stamp('x')], ['a', 'b', 'c']);
    expect(p).toEqual({ eaten: 1, total: 3, pct: 33 });
  });
  it('caps at 100 and handles empty collections', () => {
    expect(computeProgress([], []).pct).toBe(0);
    expect(computeProgress([stamp('a')], ['a']).pct).toBe(100);
  });
});

describe('earnedByDish()', () => {
  it('maps dish_id -> stamp', () => {
    const s: Stamp = { id: '1', dish_id: 'a', eaten_at: '2026-07-03T00:00:00Z' };
    expect(earnedByDish([s]).get('a')).toBe(s);
  });
});
