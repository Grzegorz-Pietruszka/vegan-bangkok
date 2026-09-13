import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import ChatScreen from '@/app/chat';
import { streamCraving } from '@/api/chat';
import { getStartPoint } from '@/tour/location';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('@/api/chat', () => ({ streamCraving: jest.fn() }));
jest.mock('@/tour/location', () => ({
  getStartPoint: jest.fn(async () => ({ lat: 13.75, lng: 100.49, fallback: false })),
}));
const mockStream = streamCraving as jest.MockedFunction<typeof streamCraving>;
const mockGetStart = getStartPoint as jest.MockedFunction<typeof getStartPoint>;

const DISH = { id: '00000000-0000-4000-8000-000000000001', nameEn: 'Khao soi', nameTh: 'ข้าวซอย',
  description: 'Curry noodles', spiceLevel: 2, tags: [], orderPhrase: null,
  skipIngredients: null, regionName: null, score: 0.9, places: [] };

beforeEach(() => mockStream.mockReset());

test('cards render from results BEFORE the stream finishes', async () => {
  mockStream.mockImplementation(async (_req, h) => {
    h.onResults([DISH]);
    h.onToken('Try khao ');
    // stream never completes — no onDone
  });
  await render(<ChatScreen />);
  await fireEvent.changeText(screen.getByTestId('chat-input'), 'warming noodles');
  await fireEvent.press(screen.getByTestId('ask-btn'));
  expect(await screen.findAllByTestId('dish-result-card')).toHaveLength(1);
  expect(screen.getByText(/Try khao/)).toBeOnTheScreen();
});

test('sends q and GPS location', async () => {
  mockStream.mockImplementation(async (_req, h) => { h.onResults([]); h.onToken('x'); h.onDone(); });
  await render(<ChatScreen />);
  await fireEvent.changeText(screen.getByTestId('chat-input'), 'soup');
  await fireEvent.press(screen.getByTestId('ask-btn'));
  await waitFor(() => expect(mockStream).toHaveBeenCalled());
  expect(mockStream.mock.calls[0][0]).toEqual({ q: 'soup', location: { lat: 13.75, lng: 100.49 } });
});

test('omits location when GPS fell back to the old-town default', async () => {
  mockGetStart.mockResolvedValueOnce({ lat: 13.75, lng: 100.49, fallback: true });
  mockStream.mockImplementation(async (_req, h) => { h.onResults([]); h.onToken('x'); h.onDone(); });
  await render(<ChatScreen />);
  await fireEvent.changeText(screen.getByTestId('chat-input'), 'soup');
  await fireEvent.press(screen.getByTestId('ask-btn'));
  await waitFor(() => expect(mockStream).toHaveBeenCalled());
  expect(mockStream.mock.calls[0][0]).toEqual({ q: 'soup' });
});

test('degraded done shows the hint line', async () => {
  mockStream.mockImplementation(async (_req, h) => {
    h.onResults([DISH]); h.onToken('Template.'); h.onDone('generation');
  });
  await render(<ChatScreen />);
  await fireEvent.changeText(screen.getByTestId('chat-input'), 'soup');
  await fireEvent.press(screen.getByTestId('ask-btn'));
  expect(await screen.findByText(/simpler wording/i)).toBeOnTheScreen();
});

test('stream error shows retry state', async () => {
  mockStream.mockImplementation(async (_req, h) => h.onError(new Error('offline')));
  await render(<ChatScreen />);
  await fireEvent.changeText(screen.getByTestId('chat-input'), 'soup');
  await fireEvent.press(screen.getByTestId('ask-btn'));
  expect(await screen.findByText(/couldn.t reach|try again/i)).toBeOnTheScreen();
});
