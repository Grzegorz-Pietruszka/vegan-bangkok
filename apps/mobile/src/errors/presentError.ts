import { AccessibilityInfo, Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import * as Sentry from '@sentry/react-native';
import { onlineManager } from '@tanstack/react-query';
import i18n from '@/i18n';
import { normalizeError, type AppError } from './appError';

export type PresentOptions = {
  /** Log to Sentry but show nothing — the caller renders the error inline. */
  silent?: boolean;
  /** Escalate to a blocking Alert instead of a toast (data loss, must-decide failures). */
  blocking?: boolean;
  /** Adds a "Try again" action to the toast / Alert. */
  retry?: () => void;
  /** Context-specific safe message ("Couldn't save that") instead of the generic mapping. */
  message?: string;
};

// One entry per code+message shown recently — the same failure firing from a global
// handler and a screen (or a retry loop) collapses into a single toast.
const lastShown = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5_000;

/**
 * Normalize → log → decide whether/how to show. Returns the AppError so callers can
 * use fieldErrors/userMessage inline. Feature code decides presentation; the API layer
 * only throws — nothing auto-toasts from interceptors, so no duplicate messages.
 */
export function presentError(error: unknown, opts: PresentOptions = {}): AppError {
  const normalized = normalizeError(error);
  const err = opts.message ? { ...normalized, userMessage: opts.message } : normalized;
  // Always preserve the original for developers — the user never sees it.
  Sentry.captureException(err.cause instanceof Error ? err.cause : err.cause ?? error, {
    tags: { errorCode: err.code },
  });
  if (opts.silent) return err;

  // Ongoing offline is owned by the persistent <OfflineBanner/> — no toast spam while
  // the device stays disconnected. (If we're "online" but the host is unreachable, the
  // toast still shows: that's news the banner can't carry.)
  if (err.code === 'offline' && !onlineManager.isOnline()) return err;

  const key = `${err.code}:${err.userMessage}`;
  const now = Date.now();
  const last = lastShown.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return err;
  lastShown.set(key, now);

  if (opts.blocking) {
    Alert.alert(
      i18n.t('errors.title'),
      err.userMessage,
      opts.retry
        ? [{ text: i18n.t('common.cancel'), style: 'cancel' }, { text: i18n.t('errors.retry'), onPress: opts.retry }]
        : undefined,
    );
    return err;
  }

  Toast.show({
    type: 'appError',
    text1: err.userMessage,
    props: { retry: opts.retry },
    visibilityTime: 6_000, // long enough to read + reach the retry action
  });
  // Toasts don't steal focus — announce for screen readers on both platforms.
  AccessibilityInfo.announceForAccessibility(err.userMessage);
  return err;
}

/** For completions the UI doesn't already make obvious — use sparingly. */
export function showSuccess(message: string): void {
  Toast.show({ type: 'appSuccess', text1: message, visibilityTime: 3_000 });
  AccessibilityInfo.announceForAccessibility(message);
}

/** Test seam. */
export function resetPresentedErrors(): void {
  lastShown.clear();
}
