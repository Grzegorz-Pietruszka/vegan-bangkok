import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { loadIdentity, saveIdentity, useIdentity } from './identity';

// expo-router's import graph pulls in untransformed ESM (standard-navigation) that jest
// can't parse — mock it, as every test reaching expo-router does (scan/chat/tour).
// useFocusEffect fires like a mount effect so the hook's focus-load path is exercised.
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));

beforeEach(() => AsyncStorage.clear());

describe('identity store', () => {
  it('round-trips name and emoji', async () => {
    await saveIdentity({ name: 'Greg', emoji: '🌴' });
    expect(await loadIdentity()).toEqual({ name: 'Greg', emoji: '🌴' });
  });

  it('trims the name and caps it at 24 chars', async () => {
    expect(await saveIdentity({ name: '  Greg  ', emoji: '🌴' })).toEqual({ name: 'Greg', emoji: '🌴' });
    const long = 'a'.repeat(30);
    const saved = await saveIdentity({ name: long, emoji: '🍜' });
    expect(saved?.name).toBe('a'.repeat(24));
    expect((await loadIdentity())?.name).toBe('a'.repeat(24));
  });

  it('empty name clears the stored identity', async () => {
    await saveIdentity({ name: 'Greg', emoji: '🌴' });
    expect(await saveIdentity({ name: '   ', emoji: '🌴' })).toBeNull();
    expect(await loadIdentity()).toBeNull();
  });

  it('tolerates corrupt storage', async () => {
    await AsyncStorage.setItem('profile_identity', 'not json');
    expect(await loadIdentity()).toBeNull();
  });

  it('rejects structurally invalid data', async () => {
    await AsyncStorage.setItem('profile_identity', JSON.stringify({ name: 42 }));
    expect(await loadIdentity()).toBeNull();
  });
});

describe('useIdentity hook', () => {
  it('loads on focus and updates after save', async () => {
    await AsyncStorage.setItem('profile_identity', JSON.stringify({ name: 'Greg', emoji: '🌴' }));
    const { result } = await renderHook(() => useIdentity());
    await waitFor(() => expect(result.current.identity).toEqual({ name: 'Greg', emoji: '🌴' })); // focus-load fired
    await act(async () => { await result.current.save({ name: 'Mai', emoji: '🍜' }); });
    expect(result.current.identity).toEqual({ name: 'Mai', emoji: '🍜' });
  });
});
