import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { isNotNull, sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { seedDatabase } from '../seed/seed.ts';
import { dishes } from '../src/db/schema.ts';
import { backfillEmbeddings } from '../src/embed/job.ts';

// Isolate this file: DB tests share one DATABASE_URL, so start clean or `n`
// (the new-embedding count) depends on whether another file embedded first.
before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes RESTART IDENTITY CASCADE`);
});
after(() => pool.end());

test('backfill writes a vector + model for every dish', async () => {
  await seedDatabase(db);
  const fake = async (texts: string[]) => texts.map(() => new Array(1536).fill(0.02));
  const n = await backfillEmbeddings(db, fake);
  assert.ok(n >= 1);
  const embedded = await db.select().from(dishes).where(isNotNull(dishes.embedding));
  assert.ok(embedded.length >= 1);
  assert.equal(embedded[0].embeddingModel, 'gemini-embedding-001');
});

test('site backfill embeds every historic site once, then is a no-op', async () => {
  const { backfillSiteEmbeddings } = await import('../src/embed/job.ts');
  const { historicSites } = await import('../src/db/schema.ts');
  const fake = async (texts: string[]) => texts.map(() => new Array(1536).fill(0.02));
  const n = await backfillSiteEmbeddings(db, fake);
  assert.equal(n, 20);
  const embedded = await db.select().from(historicSites).where(isNotNull(historicSites.embedding));
  assert.equal(embedded.length, 20);
  assert.equal(await backfillSiteEmbeddings(db, fake), 0); // stable input → no re-embed
});
