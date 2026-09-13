import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { CHANNEL_ID } from './lunchNudge';

// One-time runtime wiring. Foreground presentation is OFF everywhere: the nudge is a
// re-engagement beat — a user already in the app doesn't need it, and the one-shot is
// cheap to lose (spec: docs/superpowers/specs/2026-07-12-push-notifications-design.md).
export function initNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    // Android 8+ requires a channel before anything can be scheduled. iOS-first ship;
    // this is correctness, not polish.
    Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Lunch reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
}

// Tap → route. Only app-internal paths are trusted — anything else in data.url is ignored.
export function routeFromNotification(data: unknown): void {
  const url = (data as { url?: unknown } | null | undefined)?.url;
  if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
}

// Warm taps via the response listener; cold-start taps via the last response (the SDK 57
// documented expo-router pattern). Runs post-mount, so router.push is safe.
export function useNotificationTapObserver(): void {
  useEffect(() => {
    const last = Notifications.getLastNotificationResponse();
    if (last) routeFromNotification(last.notification.request.content.data);
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      routeFromNotification(r.notification.request.content.data),
    );
    return () => sub.remove();
  }, []);
}
