import { fetchItinerary } from '@/api/itinerary';

const STEP = {
  type: 'site', id: '00000000-0000-4000-8000-000000000001', name: 'Wat Pho',
  nameTh: 'วัดโพธิ์', lat: 13.7466, lng: 100.493, order: 0, summary: 'Temple',
  walkMetersFromPrev: 120,
};

afterEach(() => jest.restoreAllMocks());

test('posts start + presetId and parses a valid response', async () => {
  const spy = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ steps: [STEP], narrative: 'A walk.' }),
  } as unknown as Response);
  const res = await fetchItinerary({ start: { lat: 13.75, lng: 100.49 }, presetId: 'sunset' });
  expect(res.steps).toHaveLength(1);
  expect(res.narrative).toBe('A walk.');
  const [url, init] = spy.mock.calls[0];
  expect(String(url)).toMatch(/\/itinerary$/);
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({
    start: { lat: 13.75, lng: 100.49 }, presetId: 'sunset',
  });
});

test('throws on non-200', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
  await expect(fetchItinerary({ start: { lat: 13.75, lng: 100.49 }, text: 'x' })).rejects.toThrow('500');
});

test('throws when the response fails schema validation', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true, json: async () => ({ steps: [{ bogus: true }], narrative: null }),
  } as unknown as Response);
  await expect(fetchItinerary({ start: { lat: 13.75, lng: 100.49 }, text: 'x' })).rejects.toThrow();
});
