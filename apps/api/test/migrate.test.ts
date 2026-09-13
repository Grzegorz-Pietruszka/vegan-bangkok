import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
after(() => pool.end());

test('vector extension is installed', async () => {
  const { rows } = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
  assert.equal(rows.length, 1);
});
test('dishes.embedding is a 1536-dim vector', async () => {
  const { rows } = await pool.query(
    "SELECT atttypmod FROM pg_attribute WHERE attrelid = 'dishes'::regclass AND attname = 'embedding'");
  assert.equal(rows[0].atttypmod, 1536);
});
test('dishes.search_tsv exists', async () => {
  const { rows } = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name='dishes' AND column_name='search_tsv'");
  assert.equal(rows.length, 1);
});

test('query_embedding_cache table exists with composite PK (query_norm, model)', async () => {
  const { rows } = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_name='query_embedding_cache'");
  assert.equal(rows.length, 1);
  const { rows: pk } = await pool.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid='query_embedding_cache'::regclass AND contype='p'`);
  assert.equal(pk.length, 1);
  assert.match(pk[0].def, /PRIMARY KEY \(query_norm, model\)/);
});

// Asserting the index DEFINITION (not just its name) is what catches the killer failure mode:
// a migration edited after being applied leaves the live index built on a different expression
// than the one queries use, and the planner silently ignores it.
test('Tier-1 functional indexes exist and use the canonical sqlNormName expression', async () => {
  for (const col of ['name_en', 'name_th']) {
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename='dishes' AND indexname='idx_dishes_normalized_${col}'`);
    assert.equal(rows.length, 1, `index on ${col} missing`);
    assert.ok(
      rows[0].indexdef.includes(`regexp_replace(lower(${col}), '[^a-z0-9ก-๛]'::text, ''::text, 'g'::text)`),
      `index on ${col} is built on a stale expression: ${rows[0].indexdef}`);
  }
});

test('Tier-1 name equality is an index scan, not a seq scan', async () => {
  // pool is max:1, so these three statements share one session.
  await pool.query('SET enable_seqscan = off');
  try {
    const { rows } = await pool.query(`
      EXPLAIN SELECT id FROM dishes
      WHERE regexp_replace(lower(name_en), '[^a-z0-9ก-๛]', '', 'g') = 'padthai'`);
    const plan = rows.map((r: any) => r['QUERY PLAN']).join('\n');
    assert.match(plan, /Index Scan using idx_dishes_normalized_name_en/, plan);
  } finally {
    await pool.query('RESET enable_seqscan');
  }
});

test('idx_dishes_search_tsv_gin index exists', async () => {
  const { rows } = await pool.query(
    "SELECT 1 FROM pg_indexes WHERE tablename='dishes' AND indexname='idx_dishes_search_tsv_gin'");
  assert.equal(rows.length, 1);
});

// --- migration 0002: places enrichment columns (plan 09) ---

test('places has all 0002 enrichment columns with the right types', async () => {
  const { rows } = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='places'`);
  const types = new Map(rows.map((r: any) => [r.column_name, r.data_type]));
  for (const [col, type] of [
    ['google_place_id', 'text'], ['summary', 'text'], ['vibe_tags', 'ARRAY'],
    ['venue_type', 'text'], ['embedding_input', 'text'], ['embedding', 'USER-DEFINED'],
    ['embedding_model', 'text'], ['embedded_at', 'timestamp with time zone'],
    ['source', 'text'], ['fetched_at', 'timestamp with time zone'],
    ['enriched_at', 'timestamp with time zone'],
  ]) {
    assert.equal(types.get(col), type, `places.${col} missing or wrong type`);
  }
});

test('places.embedding is a 1536-dim vector', async () => {
  const { rows } = await pool.query(
    "SELECT atttypmod FROM pg_attribute WHERE attrelid = 'places'::regclass AND attname = 'embedding'");
  assert.equal(rows[0].atttypmod, 1536);
});

test('unique(google_place_id) exists on places', async () => {
  const { rows } = await pool.query(
    "SELECT indexdef FROM pg_indexes WHERE tablename='places' AND indexdef ILIKE '%google_place_id%'");
  assert.equal(rows.length, 1);
  assert.match(rows[0].indexdef, /UNIQUE/i);
});

test('NO index on places.embedding (exact scan in v1) and no vibe_tags GIN', async () => {
  const { rows } = await pool.query(`
    SELECT indexdef FROM pg_indexes
    WHERE tablename='places' AND (indexdef ILIKE '%embedding%' OR indexdef ILIKE '%vibe_tags%')`);
  assert.equal(rows.length, 0, rows.map((r: any) => r.indexdef).join('\n'));
});

// --- migration 0003: menu-scan tables (plan 11) ---

test('0003 tables exist with expected columns', async () => {
  const expected: Record<string, string[]> = {
    dish_aliases: ['id', 'dish_id', 'alias_text', 'alias_normalized'],
    ingredients: ['id', 'name_en', 'name_th', 'vegan_risk_class'],
    ingredient_aliases: ['id', 'ingredient_id', 'alias_text', 'alias_normalized', 'language'],
    dish_ingredients: ['id', 'dish_id', 'ingredient_id', 'role'],
    menu_scan_misses: ['id', 'raw_text', 'ocr_confidence', 'created_at'],
  };
  for (const [table, cols] of Object.entries(expected)) {
    const { rows } = await pool.query(
      'SELECT column_name FROM information_schema.columns WHERE table_name = $1', [table]);
    const have = new Set(rows.map((r: any) => r.column_name));
    for (const col of cols) assert.ok(have.has(col), `${table}.${col} missing`);
  }
});

test('alias_normalized is UNIQUE on both alias tables', async () => {
  for (const table of ['dish_aliases', 'ingredient_aliases']) {
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename=$1 AND indexdef ILIKE '%alias_normalized%'`, [table]);
    assert.ok(rows.some((r: any) => /UNIQUE/i.test(r.indexdef)),
      `${table}.alias_normalized needs a unique index: ${rows.map((r: any) => r.indexdef).join('\n')}`);
  }
});

test('ingredients.vegan_risk_class check constraint rejects an invalid value', async () => {
  await assert.rejects(
    pool.query(`INSERT INTO ingredients (name_en, vegan_risk_class) VALUES ('bogus', 'sometimes_ok')`),
    /vegan_risk_class/);
  // and accepts a valid one (rolled back so the seed stays canonical)
  await pool.query('BEGIN');
  await pool.query(`INSERT INTO ingredients (name_en, vegan_risk_class) VALUES ('ck-probe', 'hard_block')`);
  await pool.query('ROLLBACK');
});

test('dish_ingredients.role check constraint rejects an invalid value', async () => {
  const { rows: [d] } = await pool.query('SELECT id FROM dishes LIMIT 1');
  const { rows: [i] } = await pool.query('SELECT id FROM ingredients LIMIT 1');
  if (!d || !i) return; // corpus-dependent; exercised whenever the seed has run
  await assert.rejects(
    pool.query(`INSERT INTO dish_ingredients (dish_id, ingredient_id, role) VALUES ($1, $2, 'garnish')`,
      [d.id, i.id]),
    /role/);
});

// --- itinerary (migration 0006, plan 10) ---

test('historic_sites table exists with expected columns and category check', async () => {
  const { rows } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='historic_sites'");
  const cols = rows.map((r) => r.column_name);
  for (const c of ['id', 'name', 'name_th', 'lat', 'lng', 'category', 'summary',
    'vibe_tags', 'embedding_input', 'embedding', 'embedding_model', 'embedded_at']) {
    assert.ok(cols.includes(c), `missing column ${c}`);
  }
  const { rows: ck } = await pool.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid='historic_sites'::regclass AND contype='c'`);
  assert.ok(ck.some((r) => r.def.includes("'temple'") && r.def.includes("'cultural-site'")),
    'category check constraint missing');
});

test('historic_sites.embedding has NO index (exact scan by decision)', async () => {
  const { rows } = await pool.query(
    "SELECT indexdef FROM pg_indexes WHERE tablename='historic_sites' AND indexdef ILIKE '%embedding%'");
  assert.equal(rows.length, 0);
});

// --- migration 0007: place search (spec 2026-07-27) ---

test('0007: places.geog GiST and search_tsv GIN exist with expected definitions', async () => {
  const { rows: cols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'places' AND column_name IN ('geog','search_tsv')`);
  assert.equal(cols.length, 2);
  const { rows: idx } = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'places'
     AND indexname IN ('places_geog_gist','places_search_tsv_gin')`);
  assert.equal(idx.length, 2);
  assert.ok(idx.find((r) => r.indexname === 'places_geog_gist')!.indexdef.includes('USING gist'));
  assert.ok(idx.find((r) => r.indexname === 'places_search_tsv_gin')!.indexdef.includes('USING gin'));
});
