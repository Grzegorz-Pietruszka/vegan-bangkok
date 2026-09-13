import { itineraryResponse, type ItineraryResponse, type TimeOfDay } from '@vegan-bangkok/schemas';
import { API_BASE, HttpError } from './base';

export type TourRequest = {
  start: { lat: number; lng: number };
  presetId?: string;
  text?: string;
  radiusM?: number;
  timeOfDay?: TimeOfDay;
  maxStops?: number;
};

// Route generation runs shortlist + TSP + a Gemini narrative server-side — allow 15s.
export async function fetchItinerary(req: TourRequest): Promise<ItineraryResponse> {
  const res = await fetch(`${API_BASE}/itinerary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new HttpError(res.status);
  return itineraryResponse.parse(await res.json());
}
