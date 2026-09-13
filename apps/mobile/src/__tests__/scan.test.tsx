import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { MenuScanItem } from '@vegan-bangkok/schemas';
import ScanScreen from '@/app/scan';
import { uploadMenuPhoto } from '@/api/scanMenu';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///cam.jpg' }] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///lib.jpg' }] })),
}));
jest.mock('@/api/scanMenu', () => ({ uploadMenuPhoto: jest.fn() }));

const mockUpload = uploadMenuPhoto as jest.MockedFunction<typeof uploadMenuPhoto>;

const dish = {
  id: '00000000-0000-4000-8000-000000000001', nameEn: 'Pad see ew', nameTh: 'ผัดซีอิ๊ว',
  description: 'Wide rice noodles.', spiceLevel: 1, tags: ['noodles'],
  orderPhrase: 'pad see ew jay', skipIngredients: 'fish sauce, egg', regionName: 'Central Thailand',
  score: 1, places: [],
};

const ITEMS: MenuScanItem[] = [
  { type: 'matched', rawText: 'ผัดซีอิ๊ว Pad See Ew 60.-', ocrConfidence: 88, lowConfidence: false,
    matchedVia: 'name', dish, ingredientFlags: [] },
  { type: 'ingredient_flagged', rawText: 'ผัดผักกาดขาวน้ำมันหอย 80.-', ocrConfidence: 84, lowConfidence: false,
    ingredientFlags: [{ nameEn: 'Oyster sauce', nameTh: 'ซอสหอยนางรม', veganRiskClass: 'hard_block', matchedAlias: 'น้ำมันหอย' }],
    translation: null },
  { type: 'unmatched', rawText: 'เกี๊ยวทอดรสผัดพริกแกง 89', ocrConfidence: 79, lowConfidence: false, translation: null },
];

beforeEach(() => mockUpload.mockReset());

test('picking an image and submitting calls the upload API exactly once', async () => {
  mockUpload.mockResolvedValue(ITEMS);
  await render(<ScanScreen />);
  await fireEvent.press(screen.getByText('Choose a photo'));
  await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
  expect(mockUpload).toHaveBeenCalledWith('file:///lib.jpg');
});

test('matched item renders the shared dish-result card with the dish name', async () => {
  mockUpload.mockResolvedValue(ITEMS);
  await render(<ScanScreen />);
  await fireEvent.press(screen.getByText('Choose a photo'));
  const cards = await screen.findAllByTestId('dish-result-card');   // the SAME component Discovery renders
  expect(cards.length).toBe(1);
  expect(screen.getByText('Pad see ew')).toBeTruthy();
});

test('ingredient_flagged item renders a warning card naming the flagged ingredient', async () => {
  mockUpload.mockResolvedValue(ITEMS);
  await render(<ScanScreen />);
  await fireEvent.press(screen.getByText('Choose a photo'));
  const warnings = await screen.findAllByTestId('ingredient-warning-card');
  expect(warnings.length).toBe(1);
  expect(screen.getByText(/Oyster sauce/)).toBeTruthy();
  // the matched menu word appears as evidence (raw line title + the explicit mention)
  expect(screen.getAllByText(/น้ำมันหอย/).length).toBeGreaterThanOrEqual(2);
});

test('unmatched item renders a plain "not yet in our guide" card with the raw text', async () => {
  mockUpload.mockResolvedValue(ITEMS);
  await render(<ScanScreen />);
  await fireEvent.press(screen.getByText('Choose a photo'));
  expect(await screen.findByText(/not yet in our guide/i)).toBeTruthy();
  expect(screen.getByText('เกี๊ยวทอดรสผัดพริกแกง 89')).toBeTruthy();
});

test('upload failure shows a retry state; retrying calls the API again', async () => {
  mockUpload.mockRejectedValueOnce(new Error('network'));
  mockUpload.mockResolvedValueOnce(ITEMS);
  await render(<ScanScreen />);
  await fireEvent.press(screen.getByText('Choose a photo'));
  const retry = await screen.findByText('Try again');   // not a silent failure
  await fireEvent.press(retry);
  expect(await screen.findByText('Pad see ew')).toBeTruthy();
  expect(mockUpload).toHaveBeenCalledTimes(2);
  expect(mockUpload).toHaveBeenLastCalledWith('file:///lib.jpg');   // same photo, no re-pick
});
