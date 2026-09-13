import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql, eq } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { dishes, tags, dishTags } from '../src/db/schema.ts';
import { normalizeName } from '../src/search/normalize.ts';
import { searchByVector } from '../src/search/dishSearch.ts';

// Self-seeded fixture: this file must be non-vacuous in ANY database it runs against
// (the npm-test DB has no dish_tags rows; the dev DB has the real 57-tag vocabulary).
// So it inserts its own embedded dish + a uniquely-named faceted tag + the link, and
// deletes exactly those rows afterwards — no TRUNCATE, safe against the dev DB, where
// a fixture tag named like a real one would collide with tags_normalized_uq.
const DISH_NAME = 'ZZ facet fixture dish';
const TAG_NAME = 'zz-facet-fixture-broth';                 // normalized: zzfacetfixturebroth
const RAW_VALUE = 'ZZ-Facet Fixture BROTH!';               // normalizes to the same — exercises normalizeName on input
const FIXTURE_VEC = (() => { const v = new Array(1536).fill(0.001); v[7] = 1; return v; })();
let fixtureDishId: string;

before(async () => {
  // defensive pre-clean: leftovers from a crashed previous run (deletes cascade to dish_tags)
  await db.delete(tags).where(eq(tags.normalized, normalizeName(TAG_NAME)));
  await db.delete(dishes).where(eq(dishes.nameEn, DISH_NAME));

  const [d] = await db.insert(dishes)
    .values({ nameEn: DISH_NAME, description: 'test fixture — faceted search', embedding: FIXTURE_VEC })
    .returning({ id: dishes.id });
  fixtureDishId = d.id;
  const [t] = await db.insert(tags)
    .values({ facet: 'form', nameEn: TAG_NAME, normalized: normalizeName(TAG_NAME) })
    .returning({ id: tags.id });
  await db.insert(dishTags).values({ dishId: fixtureDishId, tagId: t.id });
});

after(async () => {
  await db.delete(tags).where(eq(tags.normalized, normalizeName(TAG_NAME)));
  await db.delete(dishes).where(eq(dishes.nameEn, DISH_NAME));
  await pool.end();
});

test('searchByVector filters by a faceted tag', async () => {
  const all = await searchByVector(FIXTURE_VEC, { limit: 100 });
  const filtered = await searchByVector(FIXTURE_VEC, { limit: 100, tags: [{ facet: 'form', value: RAW_VALUE }] });

  // non-vacuity: the fixture guarantees at least one match, so the loop below provably runs
  assert.ok(filtered.length > 0, 'faceted filter must return the fixture dish');
  assert.ok(all.length >= filtered.length, 'filtered set is a subset');

  // every returned dish actually carries the fixture faceted tag (independent SQL spelling,
  // same expression the search_hybrid functional indexes use — keeps JS↔SQL parity honest)
  for (const d of filtered) {
    const { rows: hit } = await db.execute(sql`
      SELECT 1 FROM dish_tags dt JOIN tags tg ON tg.id = dt.tag_id
      WHERE dt.dish_id = ${d.id}::uuid AND tg.facet = 'form'
        AND regexp_replace(lower(tg.name_en),'[^a-z0-9ก-๛]','','g') = ${normalizeName(RAW_VALUE)} LIMIT 1`);
    assert.equal(hit.length, 1, `${d.nameEn} should have form:${normalizeName(RAW_VALUE)}`);
  }

  // DishResult.tags hydrates from the join (flat column no longer consulted)
  const fx = filtered.find((d) => d.id === fixtureDishId);
  assert.ok(fx, 'fixture dish is in the filtered set');
  assert.ok(fx!.tags.includes(TAG_NAME), 'tags hydrate from dish_tags join');

  // same value under a different facet must NOT match — facet participates in the EXISTS
  const wrongFacet = await searchByVector(FIXTURE_VEC, { limit: 100, tags: [{ facet: 'course', value: RAW_VALUE }] });
  assert.ok(!wrongFacet.some((d) => d.id === fixtureDishId), 'facet mismatch must exclude the fixture dish');
});
