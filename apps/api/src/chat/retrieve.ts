import { sql } from 'drizzle-orm';
import type { DishResult } from '@vegan-bangkok/schemas';
import { db } from '../db/index.ts';
import { searchByVector, searchFullText } from '../search/dishSearch.ts';
import { getCachedEmbedding, putCachedEmbedding } from '../search/embeddingCache.ts';
import { MODEL } from '../embed/gemini.ts';
import { haversineM } from '../itinerary/matrix.ts';

const FETCH_N = 8;
const KEEP_N = 5;
const DISTANCE_PENALTY_PER_M = 1 / 10_000;   // −0.1 score per km — tunable const

type Loc = { lat: number; lng: number };

export async function retrieveForChat(
  q: string, location: Loc | undefined,
  deps: { embed: (texts: string[]) => Promise<number[][]> },
): Promise<{ results: DishResult[]; degraded: boolean }> {
  let results: DishResult[];
  let degraded = false;
  try {
    let vec = await getCachedEmbedding(q, MODEL);
    if (!vec) {
      [vec] = await deps.embed([q]);
      await putCachedEmbedding(q, MODEL, vec);
    }
    results = await searchByVector(vec, { limit: FETCH_N });
  } catch {
    results = await searchFullText(q, { limit: KEEP_N });
    degraded = true;
  }

  if (location && results.length > 0) {
    const placeIds = [...new Set(results.flatMap((r) => r.places.map((p) => p.id)))];
    if (placeIds.length > 0) {
      const ids = sql.join(placeIds.map((id) => sql`${id}::uuid`), sql`, `);
      const { rows } = await db.execute(sql`
        SELECT id, lat, lng FROM places WHERE id IN (${ids}) AND lat IS NOT NULL`);
      const coord = new Map((rows as { id: string; lat: number; lng: number }[])
        .map((r) => [r.id, { lat: r.lat, lng: r.lng }]));
      for (const r of results) {
        for (const p of r.places) {
          const c = coord.get(p.id);
          if (c) (p as { distanceM?: number }).distanceM = Math.round(haversineM(location, c));
        }
      }
      // re-rank: nearest serving place discounts the cosine score
      results.sort((a, b) => adjusted(b) - adjusted(a));
    }
  }
  return { results: results.slice(0, KEEP_N), degraded };
}

function adjusted(r: DishResult): number {
  const ds = r.places.map((p) => (p as { distanceM?: number }).distanceM)
    .filter((d): d is number => d != null);
  return r.score - (ds.length ? Math.min(...ds) : 0) * DISTANCE_PENALTY_PER_M;
}
