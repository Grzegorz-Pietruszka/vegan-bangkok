import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { normalizeName, sqlNormName } from '../src/search/normalize.ts';
import { db, pool } from '../src/db/index.ts';
import { seedDatabase } from '../seed/seed.ts';

test('normalizeName: strips case/space/punct, keeps Thai', () => {
  assert.equal(normalizeName('Pad Thai'), 'padthai');
  assert.equal(normalizeName('pad-thai'), 'padthai');
  assert.equal(normalizeName('  PADTHAI '), 'padthai');
  assert.equal(normalizeName('ส้มตำ'), 'ส้มตำ');
  assert.equal(normalizeName('!!!'), '');
  assert.equal(normalizeName(''), '');
});

before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes RESTART IDENTITY CASCADE`);
  await seedDatabase(db);
});
after(() => pool.end());

// The named invariant: JS normalizeName must agree with the EXACT SQL fragment production
// runs (sqlNormName — the same fragment searchByName/searchFullText interpolate), for every
// corpus name. Testing through sqlNormName (not a re-typed expression) means this test fails
// the moment either side drifts.
test('JS↔SQL parity: normalizeName matches sqlNormName for all corpus names', async () => {
  const { rows } = await db.execute(sql`
    SELECT name_en, name_th FROM dishes ORDER BY name_en`);
  assert.ok(rows.length > 0, 'corpus must not be empty');
  for (const row of rows) {
    for (const name of [(row as any).name_en, (row as any).name_th]) {
      if (!name) continue;
      const { rows: sqlRows } = await db.execute(sql`
        SELECT ${sqlNormName(sql`${name}::text`)} AS norm`);
      assert.equal(normalizeName(name), (sqlRows[0] as any).norm, `parity broken for: ${name}`);
    }
  }
});
