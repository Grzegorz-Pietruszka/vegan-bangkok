import * as Location from 'expo-location';
import { getStartPoint, OLD_TOWN, distanceKm } from '../location';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
const mocked = Location as jest.Mocked<typeof Location>;

test('returns GPS coords when permission granted', async () => {
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mocked.getCurrentPositionAsync.mockResolvedValue(
    { coords: { latitude: 13.70, longitude: 100.60 } } as never);
  expect(await getStartPoint()).toEqual({ lat: 13.70, lng: 100.60, fallback: false });
});

test('falls back to old town when permission denied', async () => {
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
  expect(await getStartPoint()).toEqual({ ...OLD_TOWN, fallback: true });
});

test('falls back to old town when position lookup throws', async () => {
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mocked.getCurrentPositionAsync.mockRejectedValue(new Error('no fix'));
  expect(await getStartPoint()).toEqual({ ...OLD_TOWN, fallback: true });
});

test('snaps to old town when GPS is far from Bangkok (e.g. planning from abroad)', async () => {
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mocked.getCurrentPositionAsync.mockResolvedValue(
    { coords: { latitude: 51.5074, longitude: -0.1278 } } as never); // London
  expect(await getStartPoint()).toEqual({ ...OLD_TOWN, fallback: true });
});

test('distanceKm: zero to self, ~9000km Bangkok→London', () => {
  expect(distanceKm(OLD_TOWN, OLD_TOWN)).toBe(0);
  expect(distanceKm(OLD_TOWN, { lat: 51.5074, lng: -0.1278 })).toBeGreaterThan(9000);
});
