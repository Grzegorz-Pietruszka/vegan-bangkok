import { z } from 'zod';

export const veganStatus = z.enum(['fully_vegan', 'vegetarian_jay', 'vegan_friendly']);
export type VeganStatus = z.infer<typeof veganStatus>;

export const place = z.object({
  id: z.uuid(),
  name: z.string(),
  neighbourhood: z.string(),
  lat: z.number(),
  lng: z.number(),
  veganStatus,
  priceBand: z.number().int().min(1).max(4),
  hours: z.record(z.string(), z.unknown()),   // jsonb; shape validated at the edges only
  nearestStation: z.string().nullable(),
  photoUrl: z.string().nullable(),
  verified: z.boolean().optional(),  // place-level trust rollup for the MAP PIN (green if any team-verified dish).
                                     // Display field, curator-set in the bundled catalog — NOT a Postgres `places` column
                                     // (trust lives on place_dishes.verified_vegan). Absent → community/yellow. Consumed by M5.
  summary: z.string().nullable().optional(),   // grounded one-liner (plan 09 / OSM enrich); optional — curated rows may lack it
  vibeTags: z.array(z.string()).optional(),    // ⊆ VIBE_VOCAB; shown as chips on the place page
});
export type Place = z.infer<typeof place>;

export const dish = z.object({
  id: z.uuid(),
  nameEn: z.string(),
  nameTh: z.string().nullable(),          // DB dishes.name_th is nullable
  description: z.string().nullable(),     // DB dishes.description is nullable
  spiceLevel: z.number().int().min(0).max(5).nullable(),  // DB dishes.spice_level is nullable
  tags: z.array(z.string()),
  orderPhrase: z.string().nullable(),
  skipIngredients: z.string().nullable(),
  regionName: z.string().nullable(),
});
export type Dish = z.infer<typeof dish>;

export const dishPlace = z.object({
  id: z.uuid(),
  name: z.string(),
  neighbourhood: z.string().nullable(),   // DB places.neighbourhood is nullable
  verifiedVegan: z.boolean(),
  lovedCount: z.number().int(),
  distanceM: z.number().optional(),
});

export const dishResult = dish.extend({
  score: z.number(),
  places: z.array(dishPlace),
});
export type DishResult = z.infer<typeof dishResult>;

// --- tag metadata ---
// Facets mirror the tags.facet check constraint (packages/db schema, migration 0004).
// Declared above searchQuery, which references it in the faceted tags filter.

export const tagFacet = z.enum(['flavor', 'cooking_method', 'form', 'ingredient_type', 'course']);
export type TagFacet = z.infer<typeof tagFacet>;

export const searchQuery = z.object({
  q: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(50).default(20),
  tags: z.array(z.object({ facet: tagFacet, value: z.string() })).optional(),
});
export type SearchQuery = z.infer<typeof searchQuery>;

export const matchType = z.enum(['name', 'alias', 'semantic', 'keyword']);
export type MatchType = z.infer<typeof matchType>;

export const searchResponse = z.object({
  results: z.array(dishResult),
  matchType: matchType.optional(),
});
export type SearchResponse = z.infer<typeof searchResponse>;

// --- menu scan (plan 11) ---

export const veganRiskClass = z.enum(['hard_block', 'conditional_review', 'safe']);
export type VeganRiskClass = z.infer<typeof veganRiskClass>;

export const ingredientFlag = z.object({
  nameEn: z.string(),
  nameTh: z.string().nullable(),
  veganRiskClass,
  matchedAlias: z.string(),   // the display-form alias that hit, for the warning card
});
export type IngredientFlag = z.infer<typeof ingredientFlag>;

const scanLineBase = {
  rawText: z.string(),
  ocrConfidence: z.number(),
  lowConfidence: z.boolean(),   // low OCR confidence: still matched, but marked — never guessed silently
};

// Jay-menu rule (plan 11): a dish match WINS over raw ingredient hits, but hits on the same
// line are surfaced on the matched item (mock-meat names like หมู/ไก่ are normal on เจ menus).
export const menuScanItem = z.discriminatedUnion('type', [
  z.object({ ...scanLineBase, type: z.literal('matched'),
    matchedVia: z.enum(['name', 'alias', 'semantic']),
    dish: dishResult,
    ingredientFlags: z.array(ingredientFlag) }),
  z.object({ ...scanLineBase, type: z.literal('ingredient_flagged'),
    ingredientFlags: z.array(ingredientFlag).min(1),
    translation: z.string().nullable() }),
  z.object({ ...scanLineBase, type: z.literal('unmatched'),
    translation: z.string().nullable() }),
]);
export type MenuScanItem = z.infer<typeof menuScanItem>;

export const scanMenuResponse = z.object({ items: z.array(menuScanItem) });
export type ScanMenuResponse = z.infer<typeof scanMenuResponse>;

// --- itinerary (plan 10) ---

export const timeOfDay = z.enum(['daytime', 'sunset', 'evening']);
export type TimeOfDay = z.infer<typeof timeOfDay>;

export const itineraryRequest = z.object({
  start: z.object({ lat: z.number(), lng: z.number() }),
  presetId: z.string().optional(),
  text: z.string().min(1).max(200).optional(),
  anchors: z.object({
    dishIds: z.array(z.uuid()).optional(),
    placeIds: z.array(z.uuid()).optional(),
    siteIds: z.array(z.uuid()).optional(),
  }).optional(),
  // radiusM/maxStops carry NO zod default: absent means "let the preset's defaults
  // apply" — the route merges body ?? preset.defaults ?? global fallback.
  radiusM: z.number().int().min(200).max(10_000).optional(),
  timeOfDay: timeOfDay.optional(),
  priceBandMax: z.number().int().min(1).max(4).optional(),   // places.price_band
  spiceMax: z.number().int().min(0).max(5).optional(),       // dishes.spice_level
  maxStops: z.number().int().min(2).max(6).optional(),
}).refine((r) => r.presetId !== undefined || r.text !== undefined || r.anchors !== undefined, {
  message: 'request must express intent: presetId, text, or anchors',
});
export type ItineraryRequest = z.infer<typeof itineraryRequest>;

export const routeStep = z.object({
  type: z.enum(['place', 'dish', 'site']),
  id: z.uuid(),
  name: z.string(),
  nameTh: z.string().nullable().optional(),
  lat: z.number(),
  lng: z.number(),
  order: z.number().int().min(0),
  summary: z.string().nullable().optional(),
  walkMetersFromPrev: z.number().nullable().optional(),  // Haversine in v1 (RouteMatrixProvider seam)
});
export type RouteStep = z.infer<typeof routeStep>;

export const itineraryResponse = z.object({
  steps: z.array(routeStep),
  narrative: z.string().nullable(),
  degraded: z.enum(['embed', 'narrative']).optional(),
  reason: z.string().optional(),   // set when steps is empty (no candidates)
});
export type ItineraryResponse = z.infer<typeof itineraryResponse>;

// --- craving chat (spec 2026-07-11) ---

export const chatRequest = z.object({
  q: z.string().min(1).max(200),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
});
export type ChatRequest = z.infer<typeof chatRequest>;

// --- place search (spec 2026-07-27-place-search-pipeline-design) ---
// Central contract of the place-search pipeline. hardFilters.vegan is z.literal(true):
// an intent with vegan filtering off cannot even be constructed.

export const placeIntentType = z.enum(['entity', 'discovery', 'planning', 'best', 'nearby']);
export type PlaceIntentType = z.infer<typeof placeIntentType>;

export const placeSearchIntent = z.object({
  intentType: placeIntentType,
  entities: z.array(z.string()),
  primaryLocation: z.string().nullable(),      // canonical district name from constants.ts
  isBestQuery: z.boolean(),
  mode: z.enum(['popular', 'hidden_gems']).nullable(),
  hardFilters: z.object({
    vegan: z.literal(true),
    openNow: z.boolean(),
    priceMax: z.number().int().min(1).max(4).nullable(),  // places.price_band
    exclude: z.array(z.string()),              // reserved for allergens (later slice)
  }),
  softPreferences: z.array(z.string()),        // ⊆ VIBE_VOCAB — ranking signal, never a filter
  semanticQuery: z.string(),
  confidence: z.number().min(0).max(1),
});
export type PlaceSearchIntent = z.infer<typeof placeSearchIntent>;

export const placeSearchQuery = z.object({
  q: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type PlaceSearchQuery = z.infer<typeof placeSearchQuery>;

export const placeResult = z.object({
  id: z.uuid(),
  name: z.string(),
  neighbourhood: z.string().nullable(),
  veganStatus: z.string().nullable(),
  priceBand: z.number().int().nullable(),
  photoUrl: z.string().nullable(),
  vibeTags: z.array(z.string()),
  lovedCount: z.number().int(),                // sum over the place's place_dishes
  distanceM: z.number().nullable(),            // null when no geo arm ran
  score: z.number(),
});
export type PlaceResult = z.infer<typeof placeResult>;

export const placeSearchResponse = z.object({
  results: z.array(placeResult),
  intent: placeSearchIntent,                   // echoed for client UX/debugging
  fallback: z.boolean(),
  fallbackReason: z.enum(['low_confidence', 'no_results']).optional(),
});
export type PlaceSearchResponse = z.infer<typeof placeSearchResponse>;

