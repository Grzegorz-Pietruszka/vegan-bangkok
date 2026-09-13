import {
  nextLunchDate, pickLunchPlace, getLunchPref, setLunchPref, syncLunchNudge,
  maybeAskPermission, toggleLunchPref, ASKED_KEY,
} from './lunchNudge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getCalendars } from 'expo-localization';
import { Alert, Linking } from 'react-native';
import { placesSeed } from '@/data/places.seed';
import { isOpenNow } from '@/lib/openNow';

// Declared now for Task 3's effectful API; harmless while only pure fns exist.
jest.mock('expo-notifications', () => ({
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'nid'),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
}));
jest.mock('expo-localization', () => ({
  getCalendars: jest.fn(() => [{ timeZone: 'Asia/Bangkok' }]),
}));
jest.mock('@/i18n', () => ({ t: (k: string, o?: Record<string, unknown>) => `${k}:${o?.place ?? ''}` }));
// expo-router's import graph pulls in untransformed ESM (standard-navigation) that jest
// can't parse — mock it, as every test reaching expo-router does (savedPlaces/scan/chat/tour).
// lunchNudge only consumes loadSaved(), never the useSavedPlaces hook, so a stub suffices.
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

const at = (h: number, m: number) => {
  const d = new Date(2026, 6, 12); // Sun 2026-07-12, local time
  d.setHours(h, m, 0, 0);
  return d;
};

describe('nextLunchDate', () => {
  it('before 09:30 → same-day 11:30', () => {
    expect(nextLunchDate(at(0, 30)).getTime()).toBe(at(11, 30).getTime());
    expect(nextLunchDate(at(9, 0)).getTime()).toBe(at(11, 30).getTime());
  });
  it('exactly 09:30 (2h boundary) → same-day 11:30', () => {
    expect(nextLunchDate(at(9, 30)).getTime()).toBe(at(11, 30).getTime());
  });
  it('inside the 2h window and after 11:30 → next day 11:30', () => {
    const tomorrow = at(11, 30); tomorrow.setDate(tomorrow.getDate() + 1);
    expect(nextLunchDate(at(10, 0)).getTime()).toBe(tomorrow.getTime());
    expect(nextLunchDate(at(11, 30)).getTime()).toBe(tomorrow.getTime());
    expect(nextLunchDate(at(18, 0)).getTime()).toBe(tomorrow.getTime());
  });
});

describe('pickLunchPlace', () => {
  const lunch = { mon: [{ open: '09:00', close: '15:00' }], sun: [{ open: '09:00', close: '15:00' }] };
  const dinner = { mon: [{ open: '17:00', close: '22:00' }], sun: [{ open: '17:00', close: '22:00' }] };
  const places = [
    { id: 'a', name: 'A', hours: lunch },
    { id: 'b', name: 'B', hours: dinner },
    { id: 'c', name: 'C', hours: lunch },
  ];
  const fireAt = at(11, 30);
  const s = (id: string, when: string) => ({ place_id: id, saved_at: when });

  it('picks the newest saved place open at fireAt', () => {
    // saved list is newest-first (loadSaved contract)
    const saved = [s('c', '3'), s('a', '2')];
    expect(pickLunchPlace(saved, places, fireAt)?.id).toBe('c');
  });
  it('skips closed places in favour of older open ones', () => {
    const saved = [s('b', '3'), s('a', '2')];
    expect(pickLunchPlace(saved, places, fireAt)?.id).toBe('a');
  });
  it('null when nothing saved is open at fireAt', () => {
    expect(pickLunchPlace([s('b', '1')], places, fireAt)).toBeNull();
  });
  it('tolerates ids missing from the catalog', () => {
    expect(pickLunchPlace([s('gone', '2'), s('a', '1')], places, fireAt)?.id).toBe('a');
  });
  it('null on empty saved list', () => {
    expect(pickLunchPlace([], places, fireAt)).toBeNull();
  });
});

const mocked = Notifications as jest.Mocked<typeof Notifications>;

describe('lunch pref', () => {
  beforeEach(() => AsyncStorage.clear());
  it('defaults on; setLunchPref(false) turns it off and back', async () => {
    expect(await getLunchPref()).toBe(true);
    await setLunchPref(false);
    expect(await getLunchPref()).toBe(false);
    await setLunchPref(true);
    expect(await getLunchPref()).toBe(true);
  });
});

describe('syncLunchNudge', () => {
  // Real bundled catalog: derive a place that IS open at the computed fireAt and use its id.
  const fireAt = nextLunchDate(new Date());
  const openPlace = placesSeed.find((p) => isOpenNow(p.hours, fireAt))!;
  const saved = [{ place_id: openPlace.id, saved_at: '2026-07-12T09:00:00.000Z' }];

  beforeEach(() => {
    jest.clearAllMocks();
    (getCalendars as jest.Mock).mockReturnValue([{ timeZone: 'Asia/Bangkok' }]);
    mocked.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    return AsyncStorage.clear();
  });

  it('cancels all, then schedules exactly one DATE notification with the place url', async () => {
    await syncLunchNudge(saved);
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const req = mocked.scheduleNotificationAsync.mock.calls[0][0];
    expect(req.content.data).toEqual({ url: `/place/${openPlace.id}` });
    expect(req.content.title).toContain(openPlace.name);
    expect(req.trigger).toMatchObject({ type: 'date' });
    const cancelOrder = mocked.cancelAllScheduledNotificationsAsync.mock.invocationCallOrder[0];
    const schedOrder = mocked.scheduleNotificationAsync.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(schedOrder); // cancel-first is the one-pending invariant
  });

  it.each([
    ['pref off', async () => setLunchPref(false)],
    ['permission denied', async () => { mocked.getPermissionsAsync.mockResolvedValue({ granted: false } as never); }],
    ['empty saved list', async () => {}],
  ])('schedules nothing when %s (but still cancels)', async (label, arrange) => {
    await arrange();
    await syncLunchNudge(label === 'empty saved list' ? [] : saved);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });

  it('schedules nothing when no saved place is open at fireAt', async () => {
    await syncLunchNudge([{ place_id: 'not-a-real-id', saved_at: '1' }]);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('outside Asia/Bangkok schedules nothing when not __DEV__', async () => {
    (getCalendars as jest.Mock).mockReturnValue([{ timeZone: 'Europe/Warsaw' }]);
    const dev = (global as { __DEV__?: boolean }).__DEV__;
    (global as { __DEV__?: boolean }).__DEV__ = false;
    try {
      await syncLunchNudge(saved);
      expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
    } finally {
      (global as { __DEV__?: boolean }).__DEV__ = dev;
    }
  });

  it('loads the saved list itself when none is passed', async () => {
    await AsyncStorage.setItem('saved_places', JSON.stringify(saved));
    await syncLunchNudge();
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('never throws when the scheduler explodes', async () => {
    // Once, not persistent: jest.clearAllMocks() clears calls but NOT implementations,
    // so a sticky rejection would leak into the later describes.
    mocked.cancelAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error('boom'));
    await expect(syncLunchNudge(saved)).resolves.toBeUndefined();
  });
});

type AlertButton = { text?: string; onPress?: () => void };

describe('maybeAskPermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCalendars as jest.Mock).mockReturnValue([{ timeZone: 'Asia/Bangkok' }]);
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false } as never);
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
    return AsyncStorage.clear();
  });

  it('shows the pre-prompt once; "Sure" requests the OS permission then syncs', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await maybeAskPermission();
    expect(spy).toHaveBeenCalledTimes(1);
    const buttons = spy.mock.calls[0][2] as AlertButton[];
    const sure = buttons.find((b) => b.text === 'notif.preYes:')!;
    sure.onPress!();
    await new Promise((r) => setTimeout(r, 0)); // let the request→sync chain settle
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalled(); // sync ran
    // second call: asked flag set, no re-prompt
    await maybeAskPermission();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('"Not now" never re-asks and never requests', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await maybeAskPermission(); // don't press anything — dismissal path
    await maybeAskPermission();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('skips the pre-prompt entirely when permission is already granted', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await maybeAskPermission();
    expect(spy).not.toHaveBeenCalled();
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalled(); // still syncs
    spy.mockRestore();
  });
});

describe('toggleLunchPref', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCalendars as jest.Mock).mockReturnValue([{ timeZone: 'Asia/Bangkok' }]);
    return AsyncStorage.clear();
  });

  it('on with permission granted → pref on, granted true', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    expect(await toggleLunchPref(true)).toEqual({ on: true, granted: true });
  });

  it('on while OS-denied → prompts once more; still denied → opens Settings', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false } as never);
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: false } as never);
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);
    const state = await toggleLunchPref(true);
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
    expect(state.granted).toBe(false);
    open.mockRestore();
  });

  it('off → pref off and pending cancelled; marks pre-prompt as asked', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    const state = await toggleLunchPref(false);
    expect(state.on).toBe(false);
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(await AsyncStorage.getItem(ASKED_KEY)).toBe('1');
  });
});
