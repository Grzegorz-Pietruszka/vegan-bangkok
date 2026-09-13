import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getCalendars } from 'expo-localization';
import { Alert, Linking } from 'react-native';
import i18n from '@/i18n';
import { placesSeed } from '@/data/places.seed';
import { isOpenNow } from '@/lib/openNow';
import { loadSaved, type SavedPlace } from '@/saved/savedPlaces';

// Saved-places lunch nudge — the app's only notification type (spec:
// docs/superpowers/specs/2026-07-12-push-notifications-design.md).
// THIS FOLDER IS THE ONLY CODE THAT TOUCHES expo-notifications (same single-seam
// discipline as the saves/identity stores).

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// Next 11:30 device-local that is at least 2h away: a 00:30 save hits the upcoming
// lunch; an 11:00 save doesn't buzz 30 minutes later while the user is still in-app.
export function nextLunchDate(now: Date): Date {
  const fire = new Date(now);
  fire.setHours(11, 30, 0, 0);
  if (fire.getTime() - now.getTime() < TWO_HOURS_MS) fire.setDate(fire.getDate() + 1);
  return fire;
}

// Newest saved place open at fireAt, or null (silence over noise). `saved` arrives
// newest-first — the loadSaved() contract.
export function pickLunchPlace<T extends { id: string; name: string; hours?: unknown }>(
  saved: SavedPlace[],
  places: T[],
  fireAt: Date,
): T | null {
  const byId = new Map(places.map((p) => [p.id, p]));
  for (const s of saved) {
    const p = byId.get(s.place_id);
    if (p && isOpenNow(p.hours as never, fireAt)) return p;
  }
  return null;
}

export const CHANNEL_ID = 'default';

// QA knob: set to e.g. 60 locally to fire the nudge in seconds instead of at 11:30.
// Only honoured in dev builds. Never commit a non-null value.
export const DEV_QUICK_FIRE_SECONDS: number | null = null;

const PREF_KEY = 'notif_pref';   // '0' = off; absent/anything else = on (grant is the real consent)
export const ASKED_KEY = 'notif_asked'; // '1' = pre-prompt already shown once

export async function getLunchPref(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREF_KEY)) !== '0';
  } catch {
    return true;
  }
}

export async function setLunchPref(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PREF_KEY, on ? '1' : '0');
    await syncLunchNudge(); // off → sync's cancel-first clears any pending
  } catch { /* nudge is garnish */ }
}

// The idempotent sync — the whole invariant lives here: cancel everything, then
// schedule at most one. Called after every saves mutation and pref change; safe to
// call redundantly. Loads the list itself when the caller can't pass one
// (useSavedPlaces' mutators don't expose the fresh list).
export async function syncLunchNudge(saved?: SavedPlace[]): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!(await getLunchPref())) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    // Hours are Bangkok-local; a pre-trip saver at home would get a wrong "open now".
    if (!__DEV__ && getCalendars()[0]?.timeZone !== 'Asia/Bangkok') return;
    const list = saved ?? (await loadSaved());
    if (list.length === 0) return;
    const fireAt = nextLunchDate(new Date());
    const place = pickLunchPlace(list, placesSeed, fireAt);
    if (!place) return; // nothing open at lunch → silence over noise
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('notif.lunchTitle', { place: place.name }),
        body: i18n.t('notif.lunchBody'),
        data: { url: `/place/${place.id}` },
      },
      trigger: __DEV__ && DEV_QUICK_FIRE_SECONDS
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: DEV_QUICK_FIRE_SECONDS, channelId: CHANNEL_ID }
        : { type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireAt, channelId: CHANNEL_ID },
    });
  } catch { /* nudge is garnish — never break saving */ }
}

// Contextual pre-prompt after the user's FIRST save — never a cold-launch OS dialog.
// Shown once per install; declining means this surface never asks again (the Profile
// toggle is the way back in).
export async function maybeAskPermission(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(ASKED_KEY)) === '1') return;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    if ((await Notifications.getPermissionsAsync()).granted) {
      await syncLunchNudge(); // granted elsewhere — nothing to ask
      return;
    }
    Alert.alert(i18n.t('notif.preTitle'), i18n.t('notif.preBody'), [
      { text: i18n.t('notif.preNo'), style: 'cancel' },
      {
        text: i18n.t('notif.preYes'),
        onPress: () => {
          Notifications.requestPermissionsAsync()
            .then(() => syncLunchNudge())
            .catch(() => {});
        },
      },
    ]);
  } catch { /* nudge is garnish */ }
}

// Profile toggle state: the switch shows on && granted (OS-denied reads as off).
export async function lunchToggleState(): Promise<{ on: boolean; granted: boolean }> {
  try {
    const [on, perm] = await Promise.all([getLunchPref(), Notifications.getPermissionsAsync()]);
    return { on, granted: perm.granted };
  } catch {
    return { on: true, granted: false };
  }
}

// Profile toggle action. Turning on while OS-denied re-requests (NOT_DETERMINED → OS
// prompt; hard-denied resolves denied without prompting) and falls back to the system
// Settings app, since iOS won't re-prompt.
export async function toggleLunchPref(next: boolean): Promise<{ on: boolean; granted: boolean }> {
  try {
    await AsyncStorage.setItem(ASKED_KEY, '1'); // engaging the toggle supersedes the pre-prompt
    if (next && !(await Notifications.getPermissionsAsync()).granted) {
      const req = await Notifications.requestPermissionsAsync();
      if (!req.granted) Linking.openSettings().catch(() => {});
    }
    await setLunchPref(next);
  } catch { /* nudge is garnish */ }
  return lunchToggleState();
}
