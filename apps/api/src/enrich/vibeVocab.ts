// Controlled vibe vocabulary — the ONLY tags a place may carry. The derive step filters
// LLM output against it (hallucination guard) and the catalog write layer re-validates.
// Must cover every hand-authored tag in seed/data.json (test/vocab.test.ts asserts this).
export const VIBE_VOCAB = [
  'historic', 'vintage', 'old-town', 'artsy', 'trendy', 'romantic',
  'street-food', 'night-market', 'hole-in-the-wall', 'hidden-gem',
  'riverside', 'canal-side', 'garden', 'rooftop',
  'late-night', 'morning', 'quiet', 'bustling', 'monsoon-comfort',
  'upscale', 'budget-friendly', 'local-favorite', 'backpacker', 'family-friendly',
  // added for historic_sites (plan 10) — used by the itinerary seed + presets
  'scenic-view', 'temple-visit', 'sunset', 'colonial',
] as const;

export type VibeTag = (typeof VIBE_VOCAB)[number];

export function isVibeTag(s: string): s is VibeTag {
  return (VIBE_VOCAB as readonly string[]).includes(s);
}
