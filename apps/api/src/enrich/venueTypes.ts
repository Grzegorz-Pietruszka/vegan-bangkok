// Venue-type vocabulary. The places.venue_type column is RESERVED in v1 — never populated
// by the bootstrap (a later vision/classifier spec owns it). Vocab defined now so the
// column's legal values are pinned from day one.
export const VENUE_TYPES = [
  'restaurant', 'street_stall', 'market_stall', 'food_court', 'cafe', 'cart',
] as const;

export type VenueType = (typeof VENUE_TYPES)[number];

export function isVenueType(s: string): s is VenueType {
  return (VENUE_TYPES as readonly string[]).includes(s);
}
