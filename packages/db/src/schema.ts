import {
  pgTable, uuid, text, integer, doublePrecision, boolean, real,
  timestamp, jsonb, vector, unique, check, primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const base = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
};

export const regions = pgTable('regions', {
  ...base,
  name: text('name').notNull(),
  description: text('description'),
}, (t) => [unique('regions_name_uq').on(t.name)]);

export const dishes = pgTable('dishes', {
  ...base,
  regionId: uuid('region_id').references(() => regions.id),
  nameEn: text('name_en').notNull(),
  nameTh: text('name_th'),
  description: text('description'),
  spiceLevel: integer('spice_level'),
  orderPhrase: text('order_phrase'),
  skipIngredients: text('skip_ingredients'),
  embeddingInput: text('embedding_input'),
  embedding: vector('embedding', { dimensions: 1536 }),
  embeddingModel: text('embedding_model'),
  embeddedAt: timestamp('embedded_at', { withTimezone: true }),
  // search_tsv is a GENERATED column added via raw SQL in the migration (Task 3).
});

export const places = pgTable('places', {
  ...base,
  name: text('name').notNull(),
  neighbourhood: text('neighbourhood'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  veganStatus: text('vegan_status'),
  priceBand: integer('price_band'),
  hours: jsonb('hours'),
  nearestStation: text('nearest_station'),
  photoUrl: text('photo_url'),
  // --- enrichment (migration 0002, plan 09) ---
  googlePlaceId: text('google_place_id'),
  summary: text('summary'),
  vibeTags: text('vibe_tags').array(),        // ⊆ VIBE_VOCAB — validated in code at write time, no DB check
  venueType: text('venue_type'),              // reserved in v1 — never populated by the bootstrap
  embeddingInput: text('embedding_input'),
  embedding: vector('embedding', { dimensions: 1536 }),  // exact scan in v1 — NO index
  embeddingModel: text('embedding_model'),
  embeddedAt: timestamp('embedded_at', { withTimezone: true }),
  source: text('source'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  enrichedAt: timestamp('enriched_at', { withTimezone: true }),
  // migration 0007: geog geography(Point,4326) + search_tsv tsvector — GENERATED columns,
  // intentionally unmapped here (Drizzle must never write them). Queried via raw sql only.
}, (t) => [
  check('vegan_status_ck', sql`${t.veganStatus} in ('fully_vegan','vegetarian_jay','vegan_friendly')`),
  check('price_band_ck', sql`${t.priceBand} between 1 and 4`),
  unique('places_google_place_id_uq').on(t.googlePlaceId),
]);

export const placeDishes = pgTable('place_dishes', {
  ...base,
  placeId: uuid('place_id').notNull().references(() => places.id),
  dishId: uuid('dish_id').notNull().references(() => dishes.id),
  verifiedVegan: boolean('verified_vegan').notNull().default(false),
  source: text('source'),
  confidence: real('confidence'),
  lovedCount: integer('loved_count').notNull().default(0),
}, (t) => [unique('place_dish_uq').on(t.placeId, t.dishId)]);

// --- menu scan (migration 0003, plan 11) ---
// alias_normalized columns are computed with normalizeName at write time — same JS↔SQL
// parity invariant as the dish name indexes. Lookups are plain equality on the column.

export const dishAliases = pgTable('dish_aliases', {
  ...base,
  dishId: uuid('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
  aliasText: text('alias_text').notNull(),          // display form, for admin/debugging
  aliasNormalized: text('alias_normalized').notNull(),
}, (t) => [unique('dish_aliases_alias_normalized_uq').on(t.aliasNormalized)]);

// veganRiskClass mirrors places.veganStatus: text + check constraint, no TS/PG enum.
export const ingredients = pgTable('ingredients', {
  ...base,
  nameEn: text('name_en').notNull(),
  nameTh: text('name_th'),
  veganRiskClass: text('vegan_risk_class').notNull(),
}, (t) => [
  check('vegan_risk_class_ck', sql`${t.veganRiskClass} in ('hard_block','conditional_review','safe')`),
]);

export const ingredientAliases = pgTable('ingredient_aliases', {
  ...base,
  ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  aliasText: text('alias_text').notNull(),
  aliasNormalized: text('alias_normalized').notNull(),
  language: text('language'),                       // 'th' | 'en' — informational
}, (t) => [unique('ingredient_aliases_alias_normalized_uq').on(t.aliasNormalized)]);

// Curation-side link (admin dashboard CRUD target) — the scan pipeline reads only the
// alias tables; this exists so "pad thai contains fish sauce by default" is expressible.
export const dishIngredients = pgTable('dish_ingredients', {
  ...base,
  dishId: uuid('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
  ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
}, (t) => [
  check('dish_ingredients_role_ck', sql`${t.role} in ('primary','hidden_risk','optional')`),
  unique('dish_ingredient_uq').on(t.dishId, t.ingredientId),
]);

// --- tag metadata (migration 0004) ---
// Controlled, faceted vocabulary. facet is text + check (values mirror packages/schemas tagFacet);
// normalized = normalizeName(name_th ?? name_en) is the term-mining match key.
export const tags = pgTable('tags', {
  ...base,
  facet: text('facet').notNull(),
  nameEn: text('name_en').notNull(),
  nameTh: text('name_th'),
  normalized: text('normalized').notNull(),
  description: text('description'),
}, (t) => [
  check('tag_facet_ck', sql`${t.facet} in ('flavor','cooking_method','form','ingredient_type','course')`),
  unique('tags_normalized_uq').on(t.normalized),
]);

export const dishTags = pgTable('dish_tags', {
  ...base,
  dishId: uuid('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [unique('dish_tag_uq').on(t.dishId, t.tagId)]);

export const ingredientTags = pgTable('ingredient_tags', {
  ...base,
  ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [unique('ingredient_tag_uq').on(t.ingredientId, t.tagId)]);

// Curation-lead log: OCR lines nothing matched. No photo, no user data — raw text only.
export const menuScanMisses = pgTable('menu_scan_misses', {
  id: uuid('id').primaryKey().defaultRandom(),
  rawText: text('raw_text').notNull(),
  ocrConfidence: real('ocr_confidence'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// --- itinerary (migration 0006, plan 10) ---
// Non-food stops for the walking-route builder. Same embedding conventions as places:
// exact scan, NO vector index (plan 10 decision), vibe_tags ⊆ VIBE_VOCAB validated in code.
export const historicSites = pgTable('historic_sites', {
  ...base,
  name: text('name').notNull(),
  nameTh: text('name_th'),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  category: text('category').notNull(),
  summary: text('summary'),
  vibeTags: text('vibe_tags').array(),
  embeddingInput: text('embedding_input'),
  embedding: vector('embedding', { dimensions: 1536 }),
  embeddingModel: text('embedding_model'),
  embeddedAt: timestamp('embedded_at', { withTimezone: true }),
}, (t) => [
  check('historic_sites_category_ck', sql`${t.category} in ('temple','museum','market','monument','palace','park','neighborhood','bridge','shrine','cultural-site')`),
  unique('historic_sites_name_uq').on(t.name),
]);

// Durable dedupe of paid query embeddings, keyed on the normalized query per model.
// Functional name indexes + the search_tsv GIN live in the same migration (hand-appended —
// drizzle-kit can't emit expression indexes).
export const queryEmbeddingCache = pgTable('query_embedding_cache', {
  queryNorm: text('query_norm').notNull(),
  model: text('model').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.queryNorm, t.model] })]);
