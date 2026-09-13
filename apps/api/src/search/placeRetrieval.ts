// Hybrid place retrieval (spec §4): three independent arms — geo, lexical, vector —
// each returning (id, score) rows, each composing hardFilterClause() into its WHERE.
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.ts';
import type { PlaceSearchIntent, PlaceResult } from '@vegan-bangkok/schemas';
import { normalizeName, sqlNormName } from './normalize.ts';
import { matchDistrict, NEAR_ME_RADIUS_M } from './constants.ts';
import { getCachedEmbedding, putCachedEmbedding } from './embeddingCache.ts';
import { MODEL } from '../embed/gemini.ts';
import type { ScoredId } from './fusion.ts';

function toVectorLiteral(v: number[]): string { return `[${v.join(',')}]`; }

function bangkokNow(): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { day: get('weekday').toLowerCase(), time: `${get('hour')}:${get('minute')}` };
}

// Hard filters — the ONE place vegan/price/open-now WHERE fragments exist.
// Every retrieval arm AND the fallback compose this; never inline these conditions elsewhere.
// vegan is unconditional: the intent schema cannot even represent vegan:false (z.literal(true)).
export function hardFilterClause(intent: PlaceSearchIntent, now = bangkokNow()): SQL {
  const conds = [sql`p.vegan_status IN ('fully_vegan', 'vegetarian_jay', 'vegan_friendly')`];
  const { priceMax, openNow } = intent.hardFilters;
  if (priceMax != null) conds.push(sql`(p.price_band IS NULL OR p.price_band <= ${priceMax})`);
  if (openNow) conds.push(sql`EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(p.hours -> ${now.day}, '[]'::jsonb)) h
    WHERE (h ->> 'open') <= ${now.time} AND (h ->> 'close') > ${now.time})`);
  return sql.join(conds, sql` AND `);
}

export function resolveGeo(
  intent: PlaceSearchIntent, userLoc?: { lat: number; lng: number },
): { lat: number; lng: number; radiusM: number } | null {
  if (intent.primaryLocation) {
    const d = matchDistrict(normalizeName(intent.primaryLocation));
    if (d) return { ...d.centroid, radiusM: d.radiusM };
  }
  if (userLoc && intent.intentType === 'nearby') return { ...userLoc, radiusM: NEAR_ME_RADIUS_M };
  return null;
}

export async function geoArm(
  intent: PlaceSearchIntent, geo: { lat: number; lng: number; radiusM: number },
): Promise<ScoredId[]> {
  const { rows } = await db.execute(sql`
    SELECT p.id, 1 - (ST_Distance(p.geog, ST_MakePoint(${geo.lng}, ${geo.lat})::geography) / ${geo.radiusM}) AS score
    FROM places p
    WHERE p.geog IS NOT NULL
      AND ST_DWithin(p.geog, ST_MakePoint(${geo.lng}, ${geo.lat})::geography, ${geo.radiusM})
      AND ${hardFilterClause(intent)}
    ORDER BY p.geog <-> ST_MakePoint(${geo.lng}, ${geo.lat})::geography
    LIMIT 50`);
  return rows.map((r: any) => ({ id: r.id, score: Number(r.score) }));
}

// Full-text over places.search_tsv + normalized name substring — mirrors searchFullText
// in dishSearch.ts (places have a single `name`, no Thai column).
export async function lexicalArm(intent: PlaceSearchIntent): Promise<ScoredId[]> {
  const text = [...intent.entities, intent.semanticQuery].join(' ').trim();
  if (!text) return [];
  const norm = normalizeName(text);
  const nameLike = sql`${sqlNormName(sql`p.name`)} LIKE '%' || ${norm} || '%'`;
  const { rows } = await db.execute(sql`
    WITH q AS (SELECT websearch_to_tsquery('simple', ${text}) AS tsq)
    SELECT p.id,
      GREATEST(
        ts_rank(p.search_tsv, q.tsq),
        CASE WHEN ${norm} <> '' AND ${nameLike} THEN 0.05 ELSE 0 END
      )::float8 AS score
    FROM places p, q
    WHERE (p.search_tsv @@ q.tsq OR (${norm} <> '' AND ${nameLike}))
      AND ${hardFilterClause(intent)}
    ORDER BY score DESC
    LIMIT 50`);
  return rows.map((r: any) => ({ id: r.id, score: Number(r.score) }));
}

// Embeds semanticQuery through the shared cache; throws on embed failure — the route
// catches, skips the arm, and sets x-search-degraded.
export async function vectorArm(
  intent: PlaceSearchIntent, embedFn: (texts: string[]) => Promise<number[][]>,
): Promise<ScoredId[]> {
  const q = intent.semanticQuery;
  if (!q) return [];
  let vec = await getCachedEmbedding(q, MODEL);
  if (!vec) {
    [vec] = await embedFn([q]);
    await putCachedEmbedding(q, MODEL, vec!);
  }
  const lit = toVectorLiteral(vec!);
  const { rows } = await db.execute(sql`
    SELECT p.id, 1 - (p.embedding <=> ${lit}::vector) AS score
    FROM places p
    WHERE p.embedding IS NOT NULL
      AND ${hardFilterClause(intent)}
    ORDER BY p.embedding <=> ${lit}::vector
    LIMIT 50`);
  return rows.map((r: any) => ({ id: r.id, score: Number(r.score) }));
}

// One query: place columns + summed loved_count + optional distance. Order and scores
// come from the ranked input (same scoreById trick as dishSearch hydrate).
export async function hydratePlaces(
  ranked: ScoredId[], geo: { lat: number; lng: number } | null,
): Promise<PlaceResult[]> {
  if (ranked.length === 0) return [];
  const ids = sql.join(ranked.map((x) => sql`${x.id}::uuid`), sql`, `);
  const distanceCol = geo
    ? sql`ST_Distance(p.geog, ST_MakePoint(${geo.lng}, ${geo.lat})::geography)::float8`
    : sql`NULL::float8`;
  const { rows } = await db.execute(sql`
    SELECT p.id, p.name, p.neighbourhood,
      p.vegan_status AS "veganStatus", p.price_band AS "priceBand", p.photo_url AS "photoUrl",
      coalesce(p.vibe_tags, '{}') AS "vibeTags",
      coalesce(sum(pd.loved_count), 0)::int AS "lovedCount",
      ${distanceCol} AS "distanceM"
    FROM places p
    LEFT JOIN place_dishes pd ON pd.place_id = p.id
    WHERE p.id IN (${ids})
    GROUP BY p.id`);
  const scoreById = new Map(ranked.map((x) => [x.id, x.score]));
  return rows
    .map((row: any) => ({
      ...row,
      distanceM: row.distanceM == null ? null : Number(row.distanceM),
      score: scoreById.get(row.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score) as PlaceResult[];
}

// Fallback (spec §6): hard filters only, radius ×2 when geo present else citywide,
// ordered by popularity — "showing popular vegan places nearby instead".
export async function fallbackQuery(
  intent: PlaceSearchIntent,
  geo: { lat: number; lng: number; radiusM: number } | null,
  limit: number,
): Promise<ScoredId[]> {
  const geoCond = geo
    ? sql`p.geog IS NOT NULL AND ST_DWithin(p.geog, ST_MakePoint(${geo.lng}, ${geo.lat})::geography, ${geo.radiusM * 2})`
    : sql`TRUE`;
  const { rows } = await db.execute(sql`
    SELECT p.id, coalesce(sum(pd.loved_count), 0)::int AS loved
    FROM places p
    LEFT JOIN place_dishes pd ON pd.place_id = p.id
    WHERE ${geoCond} AND ${hardFilterClause(intent)}
    GROUP BY p.id
    ORDER BY loved DESC
    LIMIT ${limit}`);
  // score = log-scaled popularity, normalized into (0,1] so downstream stays comparable
  return rows.map((r: any) => ({ id: r.id, score: Math.log1p(Number(r.loved)) / Math.log1p(Number((rows[0] as any).loved) + 1) || 0 }));
}

// n-gram (1–3 token) lookup against dish names and dish_aliases — gives the parser
// its knownEntities without making it async/DB-aware.
export async function findEntityMatches(q: string): Promise<string[]> {
  const tokens = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const grams = new Map<string, string>(); // norm → original n-gram
  for (let i = 0; i < tokens.length; i++) {
    for (const len of [1, 2, 3]) {
      if (i + len > tokens.length) continue;
      const gramRaw = tokens.slice(i, i + len).join(' ');
      const norm = normalizeName(gramRaw);
      if (norm) grams.set(norm, gramRaw);
    }
  }
  if (grams.size === 0) return [];
  const norms = sql.join([...grams.keys()].map((n) => sql`${n}`), sql`, `);
  const { rows } = await db.execute(sql`
    SELECT alias_normalized AS norm FROM dish_aliases WHERE alias_normalized IN (${norms})
    UNION
    SELECT ${sqlNormName(sql`name_en`)} FROM dishes WHERE ${sqlNormName(sql`name_en`)} IN (${norms})
    UNION
    SELECT ${sqlNormName(sql`name_th`)} FROM dishes WHERE ${sqlNormName(sql`name_th`)} IN (${norms})`);
  return rows.map((r: any) => grams.get(r.norm)!).filter(Boolean);
}
