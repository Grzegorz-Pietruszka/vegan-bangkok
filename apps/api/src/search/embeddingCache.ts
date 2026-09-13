import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { normalizeName } from './normalize.ts';

function toVectorLiteral(v: number[]): string { return `[${v.join(',')}]`; }

export async function getCachedEmbedding(q: string, model: string): Promise<number[] | null> {
  const key = normalizeName(q);
  if (!key) return null;
  try {
    const { rows } = await db.execute(sql`
      SELECT embedding::text AS e
      FROM query_embedding_cache
      WHERE query_norm = ${key} AND model = ${model}
      LIMIT 1`);
    if (rows.length === 0) return null;
    // pgvector text form: "[0.1,0.2,...]"
    return JSON.parse((rows[0] as any).e as string) as number[];
  } catch {
    return null; // treat any cache error as a miss
  }
}

export async function putCachedEmbedding(q: string, model: string, embedding: number[]): Promise<void> {
  const key = normalizeName(q);
  if (!key) return;
  try {
    await db.execute(sql`
      INSERT INTO query_embedding_cache (query_norm, model, embedding)
      VALUES (${key}, ${model}, ${toVectorLiteral(embedding)}::vector)
      ON CONFLICT (query_norm, model) DO NOTHING`);
  } catch {
    /* best-effort; a failed write just means we re-embed next time */
  }
}
