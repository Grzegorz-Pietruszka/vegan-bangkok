import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/i18n';
import { presentError } from '@/errors/presentError';

// Device-local saved ("want to go") places. Shape mirrors the future server table so
// v2 sync on first login is a copy, not a rewrite — same discipline as the passport store.
// THIS MODULE IS THE ONLY CODE THAT TOUCHES AsyncStorage FOR SAVES (the v2 DB seam).
export type SavedPlace = { place_id: string; saved_at: string }; // ISO

const KEY = 'saved_places';

export async function loadSaved(): Promise<SavedPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    // Keep only structurally valid entries — one malformed entry must not throw in the
    // sort (→ []) and then get persisted as a wipe by the next write.
    const parsed: unknown = JSON.parse(raw);
    const list = (Array.isArray(parsed) ? parsed : []).filter(
      (s): s is SavedPlace =>
        !!s && typeof (s as SavedPlace).place_id === 'string' && typeof (s as SavedPlace).saved_at === 'string',
    );
    return list.sort((a, b) => b.saved_at.localeCompare(a.saved_at)); // newest first
  } catch {
    return []; // missing/corrupt → empty
  }
}

export function isSaved(list: SavedPlace[], id: string): boolean {
  return list.some((s) => s.place_id === id);
}

// Mutators are read-modify-write; overlapping calls (double-tap) would both read the same
// snapshot and the second write would clobber the first. A module-level promise chain
// serializes every mutation. The queue swallows failures so one rejected op can't stall it.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op);
  queue = run.then(() => undefined, () => undefined); // chain survives failures
  return run;
}

export function toggleSaved(id: string): Promise<SavedPlace[]> {
  return serialized(async () => {
    const list = await loadSaved();
    const next = isSaved(list, id)
      ? list.filter((s) => s.place_id !== id)
      : [...list, { place_id: id, saved_at: new Date().toISOString() }];
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return loadSaved();
  });
}

export function removeSaved(id: string): Promise<SavedPlace[]> {
  return serialized(async () => {
    const list = await loadSaved();
    await AsyncStorage.setItem(KEY, JSON.stringify(list.filter((s) => s.place_id !== id)));
    return loadSaved();
  });
}

export function clearSaved(): Promise<SavedPlace[]> {
  return serialized(async () => {
    await AsyncStorage.removeItem(KEY);
    return [];
  });
}

// Pure: resolve saved entries to full objects from a catalog, preserving saved order and
// silently dropping ids no longer in the catalog. Shared by Profile and the Map overlay.
export function resolveSavedPlaces<T extends { id: string }>(saved: SavedPlace[], places: T[]): T[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  return saved.map((s) => byId.get(s.place_id)).filter((p): p is T => !!p);
}

// Focus-reload hook — the passport-screen pattern. Tabs don't render simultaneously, so
// reloading on focus keeps every screen in sync without a global reactive store.
export function useSavedPlaces() {
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  useFocusEffect(useCallback(() => { loadSaved().then(setSaved).catch(() => {}); }, []));
  // Screens call these fire-and-forget. Keep the last good state, but a failed save HAS
  // a visible consequence (the bookmark didn't stick) — toast it instead of swallowing.
  const onFail = (e: unknown) => { presentError(e, { message: i18n.t('errors.saveFailed') }); };
  const toggle = useCallback(async (id: string) => { try { setSaved(await toggleSaved(id)); } catch (e) { onFail(e); } }, []);
  const remove = useCallback(async (id: string) => { try { setSaved(await removeSaved(id)); } catch (e) { onFail(e); } }, []);
  const clear = useCallback(async () => { try { setSaved(await clearSaved()); } catch (e) { onFail(e); } }, []);
  return { saved, toggle, remove, clear };
}
