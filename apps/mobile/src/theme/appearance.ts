import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Manual appearance override. Appearance.setColorScheme() re-fires every
// useColorScheme() in the app, so the theme hooks need no extra wiring —
// this module only persists the choice. null = follow the system.
export type AppearancePref = 'light' | 'dark' | null;

const KEY = 'appearance_pref';

export async function loadAppearancePref(): Promise<AppearancePref> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw === 'light' || raw === 'dark' ? raw : null; // missing/corrupt → system
  } catch {
    return null;
  }
}

export async function setAppearancePref(pref: AppearancePref): Promise<void> {
  Appearance.setColorScheme(pref ?? 'unspecified'); // 'unspecified' = clear override, follow system
  try {
    if (pref) await AsyncStorage.setItem(KEY, pref);
    else await AsyncStorage.removeItem(KEY);
  } catch { /* pref still applies for this session */ }
}

// Call once at startup — re-applies the stored override before screens settle.
export function applyStoredAppearance(): void {
  loadAppearancePref().then((pref) => { if (pref) Appearance.setColorScheme(pref); }).catch(() => {});
}
