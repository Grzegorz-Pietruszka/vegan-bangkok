import { routeFromNotification } from './setup';
import { router } from 'expo-router';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getLastNotificationResponse: jest.fn(() => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { DEFAULT: 3 },
}));

describe('routeFromNotification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pushes app-internal string urls', () => {
    routeFromNotification({ url: '/place/abc' });
    expect(router.push).toHaveBeenCalledWith('/place/abc');
  });

  it.each([
    ['external url', { url: 'https://evil.example' }],
    ['non-string url', { url: 42 }],
    ['missing url', {}],
    ['null data', null],
    ['undefined data', undefined],
  ])('ignores %s', (_label, data) => {
    routeFromNotification(data);
    expect(router.push).not.toHaveBeenCalled();
  });
});
