import { Alert, AccessibilityInfo } from 'react-native';
import Toast from 'react-native-toast-message';
import * as Sentry from '@sentry/react-native';
import { onlineManager } from '@tanstack/react-query';
import { HttpError } from '@/api/base';
import { presentError, showSuccess, resetPresentedErrors } from './presentError';

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn(), hide: jest.fn() },
}));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

const toastShow = Toast.show as jest.Mock;
const capture = Sentry.captureException as unknown as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetPresentedErrors();
  onlineManager.setOnline(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => jest.useRealTimers());

test('shows a toast with the normalized message and announces it', () => {
  const err = presentError(new HttpError(500));
  expect(err.code).toBe('server');
  expect(toastShow).toHaveBeenCalledTimes(1);
  expect(toastShow.mock.calls[0][0]).toMatchObject({ type: 'appError', text1: err.userMessage });
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(err.userMessage);
});

test('always records the ORIGINAL error for developers', () => {
  const raw = new HttpError(500);
  presentError(raw);
  expect(capture).toHaveBeenCalledWith(raw, expect.objectContaining({ tags: { errorCode: 'server' } }));
});

test('duplicate failures inside the window collapse to one toast; window expiry re-arms', () => {
  presentError(new HttpError(500));
  presentError(new HttpError(500));
  presentError(new HttpError(503)); // same code+message → still deduped
  expect(toastShow).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(5_001);
  presentError(new HttpError(500));
  expect(toastShow).toHaveBeenCalledTimes(2);
});

test('different messages are NOT deduped against each other', () => {
  presentError(new HttpError(500));
  presentError(new HttpError(404));
  expect(toastShow).toHaveBeenCalledTimes(2);
});

test('silent: logs but never presents — caller renders inline', () => {
  const err = presentError(new HttpError(422), { silent: true });
  expect(err.code).toBe('validation');
  expect(toastShow).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(capture).toHaveBeenCalled();
});

test('offline while the device is offline → banner owns it, no toast; still logged', () => {
  onlineManager.setOnline(false);
  presentError(new TypeError('Network request failed'));
  expect(toastShow).not.toHaveBeenCalled();
  expect(capture).toHaveBeenCalled();
});

test('network failure while nominally online (host unreachable) DOES toast', () => {
  presentError(new TypeError('Network request failed'));
  expect(toastShow).toHaveBeenCalledTimes(1);
});

test('blocking: escalates to Alert instead of a toast, with retry action', () => {
  const retry = jest.fn();
  presentError(new HttpError(500), { blocking: true, retry });
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(toastShow).not.toHaveBeenCalled();
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
  expect(buttons).toHaveLength(2);
  buttons[1].onPress();
  expect(retry).toHaveBeenCalled();
});

test('message override replaces the generic mapping for display', () => {
  const err = presentError(new Error('disk full'), { message: 'Couldn’t save that — try again.' });
  expect(err.userMessage).toBe('Couldn’t save that — try again.');
  expect(toastShow.mock.calls[0][0].text1).toBe('Couldn’t save that — try again.');
});

test('showSuccess uses the success renderer', () => {
  showSuccess('Saved');
  expect(toastShow.mock.calls[0][0]).toMatchObject({ type: 'appSuccess', text1: 'Saved' });
});
