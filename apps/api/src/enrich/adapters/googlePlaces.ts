import type { CanonicalPlace, PlaceHours, SourceAdapter } from './types.ts';

// Tight FieldMask — every field here is either a copied fact or a transient derive
// input; requesting nothing else keeps the call in the cheaper Places (New) SKUs.
const FIELD_MASK =
  'id,displayName,location,regularOpeningHours,priceLevel,businessStatus,editorialSummary,reviews';

type Period = {
  open?: { day?: number; hour?: number; minute?: number };
  close?: { day?: number; hour?: number; minute?: number };
};

export type GooglePlaceRaw = {
  id: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  regularOpeningHours?: { periods?: Period[] };
  priceLevel?: string;
  businessStatus?: string;
  editorialSummary?: { text?: string };
  reviews?: { text?: { text?: string } }[];
};

const PRICE_BAND: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const hhmm = (t: { hour?: number; minute?: number }) =>
  `${String(t.hour ?? 0).padStart(2, '0')}:${String(t.minute ?? 0).padStart(2, '0')}`;

// Google periods → the seed/data.json hours shape: { mon: [{open,close}], … }.
// ponytail: periods without a close (24h venues) are dropped — none in the curated
// list; emit {open:'00:00',close:'24:00'} if one ever appears.
function toHours(periods: Period[] | undefined): PlaceHours | null {
  const out: PlaceHours = {};
  for (const p of periods ?? []) {
    if (p.open?.day == null || p.close == null) continue;
    (out[DAY_KEYS[p.open.day]] ??= []).push({ open: hhmm(p.open), close: hhmm(p.close) });
  }
  return Object.keys(out).length ? out : null;
}

export const googlePlaces: SourceAdapter<string, GooglePlaceRaw> = {
  source: 'google_places',

  async fetch(placeId) {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY ?? '',
        'X-Goog-FieldMask': FIELD_MASK,
      },
    });
    if (res.status === 404) return null; // NOT_FOUND — data, not an error
    if (!res.ok) throw new Error(`places fetch ${placeId}: ${res.status} ${await res.text()}`);
    return (await res.json()) as GooglePlaceRaw;
  },

  toCanonical(raw): CanonicalPlace {
    return {
      googlePlaceId: raw.id,
      source: 'google_places',
      name: raw.displayName?.text ?? null,
      lat: raw.location?.latitude ?? null,
      lng: raw.location?.longitude ?? null,
      hours: toHours(raw.regularOpeningHours?.periods),
      priceBand: PRICE_BAND[raw.priceLevel ?? ''] ?? null,
      fetchedAt: new Date(),
      ...(raw.businessStatus && raw.businessStatus !== 'OPERATIONAL' ? { _closed: true } : {}),
      _editorialSummary: raw.editorialSummary?.text ?? null,
      _reviewTexts: (raw.reviews ?? [])
        .map((r) => r.text?.text)
        .filter((t): t is string => Boolean(t)),
    };
  },
};
