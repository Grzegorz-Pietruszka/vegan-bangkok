import AsyncStorage from '@react-native-async-storage/async-storage';

// Device-local passport (decisions log): shape mirrors the future server table so
// v2 sync on first login is a copy, not a rewrite.
export type Stamp = {
  id: string;
  dish_id: string;
  place_id?: string;
  eaten_at: string;   // ISO
  note?: string;
  photo_uri?: string;
};

const KEY = 'passport_stamps';

export async function loadStamps(): Promise<Stamp[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Stamp[]) : [];
}

// Idempotent per dish: re-ordering the same dish doesn't duplicate the stamp.
export async function addStamp(dishId: string, placeId?: string): Promise<Stamp[]> {
  const stamps = await loadStamps();
  if (stamps.some((s) => s.dish_id === dishId)) return stamps;
  stamps.push({
    id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${dishId}`),
    dish_id: dishId,
    ...(placeId ? { place_id: placeId } : {}),
    eaten_at: new Date().toISOString(),
  });
  await AsyncStorage.setItem(KEY, JSON.stringify(stamps));
  return stamps;
}

export function computeProgress(stamps: Stamp[], collectionIds: string[]) {
  const eatenSet = new Set(stamps.map((s) => s.dish_id));
  const eaten = collectionIds.filter((id) => eatenSet.has(id)).length;
  const total = collectionIds.length;
  return { eaten, total, pct: total === 0 ? 0 : Math.min(100, Math.round((eaten / total) * 100)) };
}

export function earnedByDish(stamps: Stamp[]): Map<string, Stamp> {
  return new Map(stamps.map((s) => [s.dish_id, s]));
}
