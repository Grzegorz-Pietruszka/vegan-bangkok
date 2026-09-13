import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  loadSaved, isSaved, toggleSaved, removeSaved, clearSaved, resolveSavedPlaces, useSavedPlaces,
} from './savedPlaces';

// expo-router's import graph pulls in untransformed ESM (standard-navigation) that jest
// can't parse — mock it, as every test reaching expo-router does (scan/chat/tour).
// useFocusEffect fires like a mount effect so the hook's focus-load path is exercised.
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));

beforeEach(() => AsyncStorage.clear());

describe('savedPlaces store', () => {
  it('toggleSaved adds then removes a place', async () => {
    let list = await toggleSaved('p1');
    expect(isSaved(list, 'p1')).toBe(true);
    list = await toggleSaved('p1');
    expect(isSaved(list, 'p1')).toBe(false);
    expect(list).toHaveLength(0);
  });

  it('stores the server-mirroring shape', async () => {
    const [s] = await toggleSaved('p1');
    expect(s.place_id).toBe('p1');
    expect(Number.isNaN(new Date(s.saved_at).getTime())).toBe(false);
  });

  it('loadSaved returns newest first', async () => {
    await toggleSaved('old');
    await new Promise((r) => setTimeout(r, 5));
    await toggleSaved('new');
    const list = await loadSaved();
    expect(list[0].place_id).toBe('new');
  });

  it('removeSaved and clearSaved drop entries', async () => {
    await toggleSaved('p1');
    await toggleSaved('p2');
    expect(await removeSaved('p1')).toHaveLength(1);
    expect(await clearSaved()).toHaveLength(0);
  });

  it('tolerates corrupt storage', async () => {
    await AsyncStorage.setItem('saved_places', 'not json');
    expect(await loadSaved()).toEqual([]);
  });

  it('drops malformed entries without wiping valid ones on the next write', async () => {
    const valid = { place_id: 'keep', saved_at: '2026-01-01T00:00:00.000Z' };
    await AsyncStorage.setItem('saved_places', JSON.stringify([valid, { place_id: 42 }, null, 'junk']));
    expect(await loadSaved()).toEqual([valid]);
    const after = await toggleSaved('new');            // next write must not lose 'keep'
    expect(isSaved(after, 'new')).toBe(true);
    expect(isSaved(after, 'keep')).toBe(true);
  });

  it('serializes overlapping toggles: double-tap is add then remove', async () => {
    const [, b] = await Promise.all([toggleSaved('p1'), toggleSaved('p1')]);
    expect(isSaved(b, 'p1')).toBe(false);
    expect(b).toHaveLength(0);
    expect(await loadSaved()).toEqual([]); // storage agrees
  });

  it('resolveSavedPlaces keeps order and drops stale ids', () => {
    const saved = [{ place_id: 'b', saved_at: '2' }, { place_id: 'gone', saved_at: '1' }];
    const places = [{ id: 'a' }, { id: 'b' }];
    expect(resolveSavedPlaces(saved, places)).toEqual([{ id: 'b' }]);
  });
});

describe('useSavedPlaces hook', () => {
  it('loads on focus, toggles, and clears', async () => {
    await AsyncStorage.setItem(
      'saved_places',
      JSON.stringify([{ place_id: 'p1', saved_at: '2026-01-01T00:00:00.000Z' }]),
    );
    const { result } = await renderHook(() => useSavedPlaces());
    await waitFor(() => expect(result.current.saved).toHaveLength(1)); // focus-load fired
    expect(result.current.saved[0].place_id).toBe('p1');
    await act(async () => { await result.current.toggle('p2'); });
    expect(isSaved(result.current.saved, 'p2')).toBe(true);
    await act(async () => { await result.current.clear(); });
    expect(result.current.saved).toEqual([]);
  });
});
