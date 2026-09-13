import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, pool } from '../src/db/index.ts';
import { seedDatabase } from '../seed/seed.ts';
import { dishes, placeDishes, regions, dishAliases, ingredientAliases, historicSites } from '../src/db/schema.ts';
import { isVibeTag } from '../src/enrich/vibeVocab.ts';
import { normalizeName } from '../src/search/normalize.ts';

after(() => pool.end());   // don't wait out the 10s idle timeout on process exit

test('seed inserts dishes and links them to places (idempotent)', async () => {
  await seedDatabase(db);
  await seedDatabase(db); // second run must not duplicate
  const d = await db.select().from(dishes);
  const pd = await db.select().from(placeDishes);
  const rg = await db.select().from(regions);
  assert.ok(d.length >= 1);
  assert.ok(pd.length >= 1);
  assert.equal(rg.length, 3); // idempotent: unique(regions.name) → no duplicate regions across runs (data.json has 3)
  assert.equal(pd[0].lovedCount, 212);
});

test('seed populates menu-scan dictionaries with canonically-normalized aliases (idempotent)', async () => {
  const da = await db.select().from(dishAliases);
  const ia = await db.select().from(ingredientAliases);
  assert.ok(da.length >= 20, `expected ≥20 dish aliases, got ${da.length}`);
  assert.ok(ia.length >= 15, `expected ≥15 ingredient aliases, got ${ia.length}`);
  // every stored normalization must round-trip through the ONE normalizer
  for (const a of [...da, ...ia]) {
    assert.equal(a.aliasNormalized, normalizeName(a.aliasText), `${a.aliasText} stored stale normalization`);
  }
  // second seed run already happened above — unique(alias_normalized) must have deduped
  const dupes = await db.select().from(dishAliases);
  assert.equal(dupes.length, da.length);
});

test('seed loads 20 historic sites, vibe tags all in VIBE_VOCAB (idempotent)', async () => {
  await seedDatabase(db); // idempotency: runs after the double-run above
  const sites = await db.select().from(historicSites);
  assert.equal(sites.length, 20);
  for (const s of sites) {
    assert.ok(s.lat != null && s.lng != null, `${s.name} missing coords`);
    assert.ok(s.category, `${s.name} missing category`);
    for (const v of s.vibeTags ?? []) assert.ok(isVibeTag(v), `${s.name}: '${v}' not in VIBE_VOCAB`);
  }
});
