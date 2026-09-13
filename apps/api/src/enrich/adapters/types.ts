// Canonical place facts — the persistable output of any source adapter.
// `_`-prefixed fields are TRANSIENT derive inputs (Google ToS: derive-and-drop).
// The catalog write layer maps PERSISTED_FACT_KEYS explicitly, so raw source
// prose can never reach a column by construction.
export type PlaceHours = Record<string, { open: string; close: string }[]>;

export type CanonicalPlace = {
  googlePlaceId: string;
  source: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  hours: PlaceHours | null;
  priceBand: number | null;
  fetchedAt: Date;
  /** transient — venue reported closed; runner skips it, nothing persisted */
  _closed?: boolean;
  /** transient — derive input only, never persisted */
  _editorialSummary?: string | null;
  /** transient — derive input only, never persisted */
  _reviewTexts?: string[];
};

export const PERSISTED_FACT_KEYS = [
  'googlePlaceId', 'source', 'name', 'lat', 'lng', 'hours', 'priceBand', 'fetchedAt',
] as const satisfies readonly (keyof CanonicalPlace)[];

export type SourceAdapter<Ref, Raw> = {
  source: string;
  /** null = not found at the source (counted, not an error) */
  fetch(ref: Ref): Promise<Raw | null>;
  toCanonical(raw: Raw): CanonicalPlace;
};
