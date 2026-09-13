import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import type { DishResult } from '@vegan-bangkok/schemas';
import { normalizeName, sqlNormName } from './normalize.ts';

type SearchOpts = { region?: string; tags?: { facet: string; value: string }[]; maxSpice?: number; limit?: number };

function toVectorLiteral(v: number[]): string { return `[${v.join(',')}]`; }

// Shared hydration: given a set of (dish_id, score) rows, return DishResult[] with places.
const SELECT_DISH = sql`
  d.id, d.name_en AS "nameEn", d.name_th AS "nameTh", d.description,
  d.spice_level AS "spiceLevel",
  coalesce((SELECT array_agg(tg.name_en ORDER BY tg.name_en) FROM dish_tags dt JOIN tags tg ON tg.id = dt.tag_id
            WHERE dt.dish_id = d.id), '{}') AS tags,
  d.order_phrase AS "orderPhrase", d.skip_ingredients AS "skipIngredients",
  r.name AS "regionName"`;

async function hydrate(ranked: { id: string; score: number }[]): Promise<DishResult[]> {
  if (ranked.length === 0) return [];
  const ids = sql.join(ranked.map((x) => sql`${x.id}::uuid`), sql`, `);
  const { rows } = await db.execute(sql`
    SELECT ${SELECT_DISH},
      coalesce(json_agg(json_build_object(
        'id', p.id, 'name', p.name, 'neighbourhood', p.neighbourhood,
        'verifiedVegan', pd.verified_vegan, 'lovedCount', pd.loved_count
      )) FILTER (WHERE p.id IS NOT NULL), '[]') AS places
    FROM dishes d
    LEFT JOIN regions r ON r.id = d.region_id
    LEFT JOIN place_dishes pd ON pd.dish_id = d.id
    LEFT JOIN places p ON p.id = pd.place_id
    WHERE d.id IN (${ids})
    GROUP BY d.id, r.name`);
  const scoreById = new Map(ranked.map((x) => [x.id, x.score]));
  return rows
    .map((row: any) => ({ ...row, score: scoreById.get(row.id) ?? 0 }))
    .sort((a, b) => b.score - a.score) as DishResult[];
}

function filterClause(opts: SearchOpts) {
  const conds = [sql`d.embedding IS NOT NULL`];
  if (opts.region) conds.push(sql`r.name = ${opts.region}`);
  if (opts.maxSpice != null) conds.push(sql`d.spice_level <= ${opts.maxSpice}`);
  for (const { facet, value } of opts.tags ?? []) {
    conds.push(sql`EXISTS (SELECT 1 FROM dish_tags dt JOIN tags tg ON tg.id = dt.tag_id
      WHERE dt.dish_id = d.id AND tg.facet = ${facet}
        AND ${sqlNormName(sql`tg.name_en`)} = ${normalizeName(value)})`);
  }
  return sql.join(conds, sql` AND `);
}

export async function searchByVector(queryEmbedding: number[], opts: SearchOpts = {}): Promise<DishResult[]> {
  const limit = opts.limit ?? 20;
  const q = toVectorLiteral(queryEmbedding);
  const { rows } = await db.execute(sql`
    SELECT d.id, 1 - (d.embedding <=> ${q}::vector) AS score
    FROM dishes d LEFT JOIN regions r ON r.id = d.region_id
    WHERE ${filterClause(opts)}
    ORDER BY d.embedding <=> ${q}::vector
    LIMIT ${limit}`);
  return hydrate(rows.map((r: any) => ({ id: r.id, score: Number(r.score) })));
}

export async function searchSimilar(dishId: string, opts: { limit?: number } = {}): Promise<DishResult[]> {
  const limit = opts.limit ?? 10;
  const { rows } = await db.execute(sql`
    WITH target AS (SELECT embedding FROM dishes WHERE id = ${dishId}::uuid)
    SELECT d.id, 1 - (d.embedding <=> t.embedding) AS score
    FROM dishes d, target t
    WHERE d.id <> ${dishId}::uuid AND d.embedding IS NOT NULL AND t.embedding IS NOT NULL
    ORDER BY d.embedding <=> t.embedding
    LIMIT ${limit}`);
  return hydrate(rows.map((r: any) => ({ id: r.id, score: Number(r.score) })));
}

// Tier 1: full-name equality only — a query that normalizes to a whole dish name (EN or TH)
// is a deterministic hit, no Gemini. Partial words deliberately fall through to vector.
// No LIMIT: full-name equality is bounded by duplicate names (~1 row); the route slices.
export async function searchByName(query: string): Promise<DishResult[]> {
  const norm = normalizeName(query);
  if (!norm) return [];
  const { rows } = await db.execute(sql`
    SELECT d.id, 1.0::float8 AS score
    FROM dishes d
    WHERE ${sqlNormName(sql`d.name_en`)} = ${norm}
       OR ${sqlNormName(sql`d.name_th`)} = ${norm}`);
  return hydrate(rows.map((r: any) => ({ id: r.id, score: Number(r.score) })));
}

// Tier 1.5: exact normalized alias equality — transliteration variants ("kow soi") and curated
// product aliases ("green curry") resolve deterministically, no Gemini. alias_normalized is
// pre-normalized at write time (seed/admin), so the lookup is plain equality on the column.
// Runs strictly between the name gate and semantic search; never overrides a Tier-1 hit.
export async function searchByAlias(query: string): Promise<DishResult[]> {
  const norm = normalizeName(query);
  if (!norm) return [];
  const { rows } = await db.execute(sql`
    SELECT a.dish_id AS id, 1.0::float8 AS score
    FROM dish_aliases a
    WHERE a.alias_normalized = ${norm}`);
  return hydrate(rows.map((r: any) => ({ id: r.id, score: Number(r.score) })));
}

// Tier 3 degraded mode (Gemini down): full-text over search_tsv, unioned with a normalized
// name-substring arm on BOTH name columns — search_tsv only covers name_en + description,
// so the name_th arm is what keeps Thai-script queries answering in degraded mode.
export async function searchFullText(query: string, opts: { limit?: number } = {}): Promise<DishResult[]> {
  const limit = opts.limit ?? 20;
  const norm = normalizeName(query);
  const nameLike = sql`(${sqlNormName(sql`d.name_en`)} LIKE '%' || ${norm} || '%'
                     OR ${sqlNormName(sql`d.name_th`)} LIKE '%' || ${norm} || '%')`;
  const { rows } = await db.execute(sql`
    WITH q AS (SELECT websearch_to_tsquery('simple', ${query}) AS tsq)
    SELECT d.id,
      GREATEST(
        ts_rank(d.search_tsv, q.tsq),
        CASE WHEN ${norm} <> '' AND ${nameLike} THEN 0.05 ELSE 0 END
      )::float8 AS score
    FROM dishes d, q
    WHERE d.search_tsv @@ q.tsq
       OR (${norm} <> '' AND ${nameLike})
    ORDER BY score DESC
    LIMIT ${limit}`);
  return hydrate(rows.map((r: any) => ({ id: r.id, score: Number(r.score) })));
}
