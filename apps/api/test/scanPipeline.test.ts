import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { dishes, menuScanMisses } from '../src/db/schema.ts';
import { seedDatabase } from '../seed/seed.ts';
import { backfillEmbeddings } from '../src/embed/job.ts';
import { scanMenu } from '../src/ocr/scanPipeline.ts';

// Task 4: pipeline orchestration over MOCKED OCR lines — Tesseract is Task 3's problem.
// Test DB + the Task 0 seed; deterministic fake embeddings so the semantic tier is exact.

function vec(i: number) { const v = new Array(1536).fill(0.001); v[i % 1536] = 1; return v; }
let dishVec: Map<string, number[]>;   // nameEn → its (fake) embedding

before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes, query_embedding_cache, menu_scan_misses RESTART IDENTITY CASCADE`);
  await seedDatabase(db);
  const rows = await db.select({ id: dishes.id, nameEn: dishes.nameEn }).from(dishes);
  let i = 0;
  const byInput = new Map<string, number[]>();
  dishVec = new Map();
  await backfillEmbeddings(db, async (texts) => texts.map((t) => {
    const v = vec(i++); byInput.set(t, v); return v;
  }));
  // recover which vector landed on which dish via the stored embedding_input
  const embedded = await db.execute(sql`SELECT name_en AS n, embedding_input AS ei FROM dishes`);
  for (const r of embedded.rows as any[]) if (byInput.has(r.ei)) dishVec.set(r.n, byInput.get(r.ei)!);
  assert.ok(rows.length >= 30 && dishVec.size >= 30, 'seed corpus must be embedded');
});
after(() => pool.end());

const line = (text: string, confidence = 88) => ({ text, confidence });
const noEmbed = async () => { throw new Error('embedFn must not be called'); };

test('seeded dish on a real menu line → matched card, deterministic tier, no embed call', async () => {
  // real line shape from the provided jay-menu photo: Thai + Latin + price on ONE line —
  // whole-line equality can never hit; script segmentation must
  const [item] = await scanMenu([line('ผัดซีอิ๊ว Pad See Ew 60.-')], { embedFn: noEmbed });
  assert.equal(item.type, 'matched');
  assert.ok(item.type === 'matched');
  assert.equal(item.dish.nameEn, 'Pad see ew');
  assert.equal(item.matchedVia, 'name');
  assert.equal(typeof item.dish.orderPhrase, 'string');   // full dish-card payload
  assert.ok('skipIngredients' in item.dish);
  assert.ok(Array.isArray(item.dish.places));
});

test('transliteration alias resolves via segments (Tier 1.5), no embed call', async () => {
  const [item] = await scanMenu([line('Kow Soi 118')], { embedFn: noEmbed });
  assert.equal(item.type, 'matched');
  assert.ok(item.type === 'matched');
  assert.equal(item.dish.nameEn, 'Khao soi');
  assert.equal(item.matchedVia, 'alias');
});

test('เจ-suffixed jay-menu variant matches its base dish (ข้าวซอยเจ → Khao soi)', async () => {
  const [item] = await scanMenu([line('ข้าวซอยเจ')], { embedFn: noEmbed });
  assert.equal(item.type, 'matched');
  assert.ok(item.type === 'matched');
  assert.equal(item.dish.nameEn, 'Khao soi');
});

test('jay rule: dish match WINS over an animal word on the same line — flag surfaced, not silent', async () => {
  const [item] = await scanMenu([line('ผัดซีอิ๊ว pork 60.-')], { embedFn: noEmbed });
  assert.equal(item.type, 'matched', 'dish match must win over a raw ingredient flag');
  assert.ok(item.type === 'matched');
  assert.equal(item.dish.nameEn, 'Pad see ew');
  assert.deepEqual(item.ingredientFlags.map((f) => f.nameEn), ['Pork'],
    'the ingredient hit must be SURFACED on the matched item');
});

test('hard-block ingredient with NO dish match → ingredient_flagged (the load-bearing case)', async () => {
  // noEmbed doubles as a spy: an explicit ingredient hit must SHORT-CIRCUIT the semantic
  // tier — a fuzzy vector match may never override a hard-block ingredient word.
  const [item] = await scanMenu([line('ผัดผักกาดขาวน้ำมันหอย 80.-')], { embedFn: noEmbed });
  assert.equal(item.type, 'ingredient_flagged');
  assert.ok(item.type === 'ingredient_flagged');
  assert.equal(item.ingredientFlags[0].nameEn, 'Oyster sauce');
  assert.equal(item.ingredientFlags[0].veganRiskClass, 'hard_block');
  assert.equal(item.translation, null);
});

test('novel line, no ingredient hit → unmatched + a menu_scan_misses row (curation lead)', async () => {
  await db.execute(sql`TRUNCATE menu_scan_misses`);
  const raw = 'เกี๊ยวทอดรสผัดพริกแกง 89';
  // noEmbed throws when the semantic tier probes it → degrades → still an honest unmatched
  const [item] = await scanMenu([line(raw, 77)], { embedFn: noEmbed });
  assert.equal(item.type, 'unmatched');
  assert.ok(item.type === 'unmatched');
  assert.equal(item.rawText, raw);
  assert.equal(item.translation, null);
  const misses = await db.select().from(menuScanMisses);
  assert.equal(misses.length, 1);
  assert.equal(misses[0].rawText, raw);
  assert.equal(Math.round(misses[0].ocrConfidence!), 77);
});

test('pure-noise OCR junk (prices, stray glyphs) is dropped — no item, no miss row', async () => {
  await db.execute(sql`TRUNCATE menu_scan_misses`);
  const items = await scanMenu([line('60.-'), line('+ o ~'), line('๕๕')], { embedFn: noEmbed });
  assert.equal(items.length, 0);
  assert.equal((await db.select().from(menuScanMisses)).length, 0);
});

test('low-confidence line is still matched but marked, never silently guessed', async () => {
  const [item] = await scanMenu([line('ผัดซีอิ๊ว Pad See Ew 60.-', 31)], { embedFn: noEmbed });
  assert.equal(item.type, 'matched');
  assert.equal(item.lowConfidence, true);
  const [ok] = await scanMenu([line('ผัดซีอิ๊ว Pad See Ew 60.-', 90)], { embedFn: noEmbed });
  assert.equal(ok.lowConfidence, false);
});

test('semantic tier: high-similarity line matches; low-similarity falls through to unmatched', async () => {
  await db.execute(sql`TRUNCATE menu_scan_misses, query_embedding_cache`);
  const somTamVec = dishVec.get('Som tam')!;
  // "papaya salad with peanuts" — embeds (mock) right on top of Som tam
  const [hit] = await scanMenu([line('papaya salad with peanuts')],
    { embedFn: async (t) => t.map(() => somTamVec) });
  assert.equal(hit.type, 'matched');
  assert.ok(hit.type === 'matched');
  assert.equal(hit.dish.nameEn, 'Som tam');
  assert.equal(hit.matchedVia, 'semantic');
  // far-away vector → best score below the match threshold → honest unmatched, logged
  const far = new Array(1536).fill(0); far[1535] = -1;
  const [miss] = await scanMenu([line('mystery specialty of the house')],
    { embedFn: async (t) => t.map(() => far) });
  assert.equal(miss.type, 'unmatched');
  const misses = await db.select().from(menuScanMisses);
  assert.equal(misses.length, 1);
});

test('embedFn failure degrades to unmatched — a dead Gemini key cannot 500 a scan', async () => {
  await db.execute(sql`TRUNCATE menu_scan_misses`);
  const [item] = await scanMenu([line('mystery specialty of the house')],
    { embedFn: async () => { throw new Error('quota'); } });
  assert.equal(item.type, 'unmatched');
});
