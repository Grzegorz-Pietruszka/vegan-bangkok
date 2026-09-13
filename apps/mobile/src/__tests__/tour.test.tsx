import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { ItineraryResponse } from '@vegan-bangkok/schemas';
import TourScreen from '@/app/(tabs)/tour';
import { fetchItinerary } from '@/api/itinerary';
import { BANGKOK_AREAS } from '@/tour/areas';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/api/itinerary', () => ({ fetchItinerary: jest.fn() }));
jest.mock('@/tour/location', () => ({
  getStartPoint: jest.fn(async () => ({ lat: 13.7515, lng: 100.492, fallback: false })),
  OLD_TOWN: { lat: 13.7515, lng: 100.492 },
}));

const mockFetch = fetchItinerary as jest.MockedFunction<typeof fetchItinerary>;

const ROUTE: ItineraryResponse = {
  steps: [
    { type: 'site', id: '00000000-0000-4000-8000-000000000001', name: 'Wat Pho',
      nameTh: 'วัดโพธิ์', lat: 13.7466, lng: 100.493, order: 0,
      summary: 'A sprawling old-city temple famous for its giant reclining Buddha, tiled chedis, massage heritage, and calmer courtyards.',
      walkMetersFromPrev: 300 },
    { type: 'place', id: '00000000-0000-4000-8000-000000000002', name: 'Jae Oa',
      nameTh: null, lat: 13.7405, lng: 100.5095, order: 1, summary: 'Jay food', walkMetersFromPrev: 1200 },
  ],
  narrative: 'Start at Wat Pho.',
};

beforeEach(() => {
  mockFetch.mockReset();
  mockPush.mockReset();
});

test('a generated sight expands inline without router navigation', async () => {
  mockFetch.mockResolvedValue(ROUTE);
  await render(<TourScreen />);
  await fireEvent.press(screen.getByText('Temples + lunch'));
  await fireEvent.press(screen.getByTestId('generate-btn'));
  await screen.findByText('Wat Pho');

  await fireEvent(screen.getByTestId(
    `tour-summary-measure-${ROUTE.steps[0].id}`,
    { includeHiddenElements: true },
  ), 'textLayout', {
    nativeEvent: { lines: [{}, {}, {}] },
  });
  await fireEvent.press(screen.getByTestId('tour-step-0'));

  expect(screen.getByText('Show less')).toBeOnTheScreen();
  expect(screen.getByTestId(`tour-summary-${ROUTE.steps[0].id}`)).not.toHaveProp('numberOfLines');
  expect(mockPush).not.toHaveBeenCalled();
});

test('Generate is disabled until a chip or text is chosen', async () => {
  await render(<TourScreen />);
  expect(screen.getByTestId('generate-btn')).toBeDisabled();
  await fireEvent.press(screen.getByText('Golden hour'));
  expect(screen.getByTestId('generate-btn')).not.toBeDisabled();
});

test('generating with a chip calls the API with presetId and renders the timeline', async () => {
  mockFetch.mockResolvedValue(ROUTE);
  await render(<TourScreen />);
  await fireEvent.press(screen.getByText('Golden hour'));
  await fireEvent.press(screen.getByTestId('generate-btn'));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  expect(mockFetch.mock.calls[0][0]).toEqual({
    start: { lat: 13.7515, lng: 100.492 }, presetId: 'sunset' });
  expect(await screen.findByText('Wat Pho')).toBeOnTheScreen();
  expect(screen.getByText('2 stops · 1.5 km · ~1 h')).toBeOnTheScreen();
  expect(screen.getByText('Start at Wat Pho.')).toBeOnTheScreen();
});

test('free text is sent as text, not presetId', async () => {
  mockFetch.mockResolvedValue(ROUTE);
  await render(<TourScreen />);
  await fireEvent.changeText(screen.getByTestId('tour-text-input'), 'quiet riverside dessert');
  await fireEvent.press(screen.getByTestId('generate-btn'));
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  expect(mockFetch.mock.calls[0][0]).toEqual({
    start: { lat: 13.7515, lng: 100.492 }, text: 'quiet riverside dessert' });
});

test('intent screen shows the two-path clarity line', async () => {
  await render(<TourScreen />);
  expect(screen.getByText('Describe it, tap to build it, or both.')).toBeOnTheScreen();
});

test('text and a vibe chip combine into a single request', async () => {
  mockFetch.mockResolvedValue(ROUTE);
  await render(<TourScreen />);
  await fireEvent.press(screen.getByText('Golden hour'));
  await fireEvent.changeText(screen.getByTestId('tour-text-input'), 'quiet riverside dessert');
  await fireEvent.press(screen.getByTestId('generate-btn'));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  expect(mockFetch.mock.calls[0][0]).toEqual({
    start: { lat: 13.7515, lng: 100.492 },
    presetId: 'sunset',
    text: 'quiet riverside dessert',
  });
});

test('When + Length selections reach the itinerary request', async () => {
  mockFetch.mockResolvedValue(ROUTE);
  await render(<TourScreen />);
  await fireEvent.press(screen.getByText('Golden hour'));
  await fireEvent.press(screen.getByTestId('details-toggle'));
  await fireEvent.press(screen.getByTestId('when-evening'));
  await fireEvent.press(screen.getByTestId('length-6'));
  await fireEvent.press(screen.getByTestId('generate-btn'));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  expect(mockFetch.mock.calls[0][0]).toEqual({
    start: { lat: 13.7515, lng: 100.492 },
    presetId: 'sunset',
    timeOfDay: 'evening',
    maxStops: 6,
  });
});

test('a picked start area overrides the GPS start with its centroid', async () => {
  mockFetch.mockResolvedValue(ROUTE);
  const chinatown = BANGKOK_AREAS.find((a) => a.id === 'chinatown')!;
  await render(<TourScreen />);
  await fireEvent.press(screen.getByText('Golden hour'));
  await fireEvent.press(screen.getByTestId('details-toggle'));
  await fireEvent.press(screen.getByTestId('area-chinatown'));
  await fireEvent.press(screen.getByTestId('generate-btn'));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  expect(mockFetch.mock.calls[0][0]).toEqual({
    start: { lat: chinatown.lat, lng: chinatown.lng },
    presetId: 'sunset',
  });
});

test('API failure shows the retry card', async () => {
  mockFetch.mockRejectedValue(new Error('itinerary failed: 500'));
  await render(<TourScreen />);
  await fireEvent.press(screen.getByText('Night walk'));
  await fireEvent.press(screen.getByTestId('generate-btn'));
  expect(await screen.findByText(/couldn.t build/i)).toBeOnTheScreen();
  expect(screen.getByTestId('retry-btn')).toBeOnTheScreen();
});

test('empty steps shows the widen-radius state', async () => {
  mockFetch.mockResolvedValue({ steps: [], narrative: null, reason: 'no candidates within radius' });
  await render(<TourScreen />);
  await fireEvent.press(screen.getByText('Night walk'));
  await fireEvent.press(screen.getByTestId('generate-btn'));
  expect(await screen.findByText(/nothing walkable/i)).toBeOnTheScreen();
});

test('degraded response renders the hint line', async () => {
  mockFetch.mockResolvedValue({ ...ROUTE, degraded: 'embed' });
  await render(<TourScreen />);
  await fireEvent.press(screen.getByText('Night walk'));
  await fireEvent.press(screen.getByTestId('generate-btn'));
  expect(await screen.findByText(/service degraded/i)).toBeOnTheScreen();
});
