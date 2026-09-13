import { eq, sql } from 'drizzle-orm';
import type { DB } from '../db/index.ts';
import { dishes, regions, historicSites } from '../db/schema.ts';
import { composeDishInput, composePlaceInput } from './compose.ts';
import { MODEL } from './gemini.ts';

type EmbedFn = (texts: string[]) => Promise<number[][]>;

export async function backfillEmbeddings(db: DB, embedFn: EmbedFn): Promise<number> {
  const rows = await db.select({
    id: dishes.id, nameEn: dishes.nameEn, description: dishes.description,
    spiceLevel: dishes.spiceLevel, orderPhrase: dishes.orderPhrase,
    skipIngredients: dishes.skipIngredients, regionName: regions.name,
    embedding: dishes.embedding, embeddingInput: dishes.embeddingInput,
  }).from(dishes).leftJoin(regions, eq(dishes.regionId, regions.id));

  // One query for every dish's faceted tags; grouped in memory.
  const tagRows = await db.execute(sql`
    SELECT dt.dish_id AS "dishId", tg.facet, tg.name_en AS "nameEn"
    FROM dish_tags dt JOIN tags tg ON tg.id = dt.tag_id
    ORDER BY dt.dish_id, tg.facet, tg.name_en`);
  const tagsByDish = new Map<string, { facet: string; nameEn: string }[]>();
  for (const r of tagRows.rows as { dishId: string; facet: string; nameEn: string }[]) {
    (tagsByDish.get(r.dishId) ?? tagsByDish.set(r.dishId, []).get(r.dishId)!).push({ facet: r.facet, nameEn: r.nameEn });
  }

  const inputs = rows.map((r) => ({ r, input: composeDishInput({ ...r, tags: tagsByDish.get(r.id) ?? [] }) }));
  const stale = inputs.filter(({ r, input }) => r.embedding == null || r.embeddingInput !== input);
  if (stale.length === 0) return 0;

  // One dish per list element (safe on 001). gemini-embedding-001 caps contents-per-request
  // (Gemini API embeddings docs: 100 texts/request); stay at/under it and, on a batch-size 400,
  // fall back to one text at a time so a single oversized/over-cap batch can't fail the whole job.
  const CHUNK = 100;
  for (let i = 0; i < stale.length; i += CHUNK) {
    const slice = stale.slice(i, i + CHUNK);
    let vectors: number[][];
    try {
      vectors = await embedFn(slice.map((s) => s.input));
    } catch (err: unknown) {
      const e = err as { status?: number; code?: number };
      if (e?.status !== 400 && e?.code !== 400) throw err; // only degrade on a batch-size / INVALID_ARGUMENT 400
      vectors = [];
      for (const s of slice) vectors.push((await embedFn([s.input]))[0]);
    }
    for (let j = 0; j < slice.length; j++) {
      await db.update(dishes).set({
        embedding: vectors[j], embeddingInput: slice[j].input,
        embeddingModel: MODEL, embeddedAt: new Date(),
      }).where(eq(dishes.id, slice[j].r.id));
    }
  }
  return stale.length;
}

// Historic sites (plan 10). Same staleness rule as dishes; site docs reuse the place
// composer — identical fields (name, summary, vibeTags). 20 rows, one batch call.
export async function backfillSiteEmbeddings(db: DB, embedFn: EmbedFn): Promise<number> {
  const rows = await db.select().from(historicSites);
  const stale = rows.map((r) => ({ r, input: composePlaceInput(r) }))
    .filter(({ r, input }) => r.embedding == null || r.embeddingInput !== input);
  if (stale.length === 0) return 0;
  const vectors = await embedFn(stale.map((s) => s.input));
  for (let i = 0; i < stale.length; i++) {
    await db.update(historicSites).set({
      embedding: vectors[i], embeddingInput: stale[i].input,
      embeddingModel: MODEL, embeddedAt: new Date(),
    }).where(eq(historicSites.id, stale[i].r.id));
  }
  return stale.length;
}
