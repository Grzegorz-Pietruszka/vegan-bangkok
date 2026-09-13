import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Device-local traveler identity (name + emoji avatar). Anonymous v1: no auth, no network.
// THIS MODULE IS THE ONLY CODE THAT TOUCHES AsyncStorage FOR IDENTITY — it is the v2
// account-sync seam, same single-touchpoint discipline as the saves/passport stores.
export type Identity = { name: string; emoji: string };

const KEY = 'profile_identity';
const NAME_MAX = 24;

export async function loadIdentity(): Promise<Identity | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    // Validate shape on read — the savedPlaces lesson: bad data never escapes or throws.
    const parsed: unknown = JSON.parse(raw);
    const id = parsed as Identity;
    if (!id || typeof id.name !== 'string' || typeof id.emoji !== 'string' || id.name.trim() === '') {
      return null;
    }
    return { name: id.name, emoji: id.emoji };
  } catch {
    return null; // missing/corrupt → unset
  }
}

// No write serializer (unlike savedPlaces): single-key overwrite with no read-modify-write,
// so last write wins is correct.
export async function saveIdentity(next: Identity): Promise<Identity | null> {
  const name = next.name.trim().slice(0, NAME_MAX);
  if (name === '') {
    await AsyncStorage.removeItem(KEY); // empty name is how the user clears their identity
    return null;
  }
  const identity: Identity = { name, emoji: next.emoji };
  await AsyncStorage.setItem(KEY, JSON.stringify(identity));
  return identity;
}

// Focus-reload hook — the passport-screen pattern. Tabs don't render simultaneously, so
// reloading on focus keeps every screen in sync without a global reactive store.
export function useIdentity() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  useFocusEffect(useCallback(() => { loadIdentity().then(setIdentity).catch(() => {}); }, []));
  const save = useCallback(async (next: Identity) => {
    try { setIdentity(await saveIdentity(next)); } catch { /* keep last good state */ }
  }, []);
  return { identity, save };
}
