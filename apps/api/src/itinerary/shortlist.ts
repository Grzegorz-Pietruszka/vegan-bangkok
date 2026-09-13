import { sql } from 'drizzle-orm';
import type { DB } from '../db/index.ts';
import { places, historicSites, dishes, placeDishes } from '../db/schema.ts';
import type { TimeSlot } from './presets.ts';
import { haversineM } from './matrix.ts';

export type ShortlistIntent = {
  start: { lat: number; lng: number };
  text?: string;
  vibeTags: readonly string[];              // from the preset; may be empty
  radiusM: number;
  timeOfDay?: TimeSlot;
  priceBandMax?: number;
  spiceMax?: number;
  anchors: { placeIds: string[]; siteIds: string[]; dishIds: string[] };
};

export type Candidate = {
  type: 'place' | 'site' | 'dish';
  id: string;
  name: string;
  nameTh: string | null;
  lat: number;
  lng: number;
  summary: string | null;
  vibeTags: string[];
  priceBand: number | null;
  distanceM: number;
  score: number;
  vibeScore: number;      // 0..1 — feeds the cost-matrix vibe bonus
  anchor: boolean;
};

export const SHORTLIST_CAP = 12;   // Held-Karp ceiling (route.ts)

// Blend weights — tunable consts, not config. In degraded mode the cosine term is 0,
// which by construction leaves vibe overlap as the lead signal (plan 10 degrade rule).
const W = { cos: 0.45, vibe: 0.25, geo: 0.2, price: 0.1 };

const SLOT_TIME: Record<TimeSlot, string> = { daytime: '12:00', sunset: '18:00', evening: '20:00' };

type HoursJson = Record<string, { open: string; close: string }[]>;

// Lenient by design: unknown/missing hours never drop a candidate — only a day that is
// explicitly present and closed at the slot time does.
export function openAtSlot(hours: unknown, slot: TimeSlot | undefined, now: Date): boolean {
  if (!slot || hours == null || typeof hours !== 'object') return true;
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' })
    .format(now).toLowerCase();
  const intervals = (hours as HoursJson)[day];
  if (intervals === undefined) return true;
  const t = SLOT_TIME[slot];
  return intervals.some((iv) => iv.open <= t && t < iv.close);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;   // embeddings are L2-normalized (plan 08 convention)
}

type Row = {
  type: 'place' | 'site';
  id: string; name: string; nameTh: string | null;
  lat: number | null; lng: number | null;
  summary: string | null; vibeTags: string[] | null;
  priceBand: number | null; hours: unknown; embedding: number[] | null;
};

export async function buildShortlist(
  intent: ShortlistIntent,
  deps: { db: DB; embed: (text: string) => Promise<number[]>; now?: Date },
): Promise<{ candidates: Candidate[]; degraded: boolean }> {
  const { db } = deps;
  const now = deps.now ?? new Date();

  let queryVec: number[] | null = null;
  let degraded = false;
  if (intent.text) {
    try {
      queryVec = await deps.embed(intent.text);
    } catch {
      degraded = true;   // embedder down → vibe/geo-only ranking, never fatal
    }
  }

  const placeRows: Row[] = (await db.select().from(places)).map((p) => ({
    type: 'place' as const, id: p.id, name: p.name, nameTh: null, lat: p.lat, lng: p.lng,
    summary: p.summary, vibeTags: p.vibeTags, priceBand: p.priceBand, hours: p.hours,
    embedding: p.embedding,
  }));
  const siteRows: Row[] = (await db.select().from(historicSites)).map((s) => ({
    type: 'site' as const, id: s.id, name: s.name, nameTh: s.nameTh, lat: s.lat, lng: s.lng,
    summary: s.summary, vibeTags: s.vibeTags, priceBand: null, hours: null,
    embedding: s.embedding,
  }));

  // spiceMax drops only places whose EVERY linked dish exceeds it; places without dish
  // links are unknown, and unknown never filters (same leniency as hours).
  let spiceFail: Set<string> | null = null;
  if (intent.spiceMax != null) {
    const { rows } = await db.execute(sql`
      SELECT pd.place_id AS id
      FROM place_dishes pd JOIN dishes d ON d.id = pd.dish_id
      GROUP BY pd.place_id
      HAVING bool_and(d.spice_level IS NOT NULL AND d.spice_level > ${intent.spiceMax})`);
    spiceFail = new Set((rows as { id: string }[]).map((r) => r.id));
  }

  const anchorIds = new Set([...intent.anchors.placeIds, ...intent.anchors.siteIds]);
  const vibeSet = new Set(intent.vibeTags);

  const score = (row: Row, distanceM: number): { score: number; vibeScore: number } => {
    const cos = queryVec && row.embedding ? cosine(queryVec, row.embedding) : 0;
    const overlap = row.vibeTags?.filter((v) => vibeSet.has(v)).length ?? 0;
    const vibeScore = vibeSet.size > 0 ? overlap / vibeSet.size : 0;
    const geo = Math.max(0, 1 - distanceM / intent.radiusM);
    const price = row.priceBand != null ? (row.priceBand - 1) / 3 : 0;
    return { score: W.cos * cos + W.vibe * vibeScore + W.geo * geo - W.price * price, vibeScore };
  };

  const toCandidate = (row: Row, anchor: boolean): Candidate | null => {
    if (row.lat == null || row.lng == null) return null;
    const distanceM = haversineM(intent.start, { lat: row.lat, lng: row.lng });
    if (!anchor) {
      if (distanceM > intent.radiusM) return null;
      if (row.type === 'place' && !openAtSlot(row.hours, intent.timeOfDay, now)) return null;
      if (intent.priceBandMax != null && row.priceBand != null && row.priceBand > intent.priceBandMax) return null;
      if (spiceFail?.has(row.id)) return null;
    }
    const s = score(row, distanceM);
    return {
      type: row.type, id: row.id, name: row.name, nameTh: row.nameTh,
      lat: row.lat, lng: row.lng, summary: row.summary, vibeTags: row.vibeTags ?? [],
      priceBand: row.priceBand, distanceM, ...s, anchor,
    };
  };

  const anchors: Candidate[] = [];
  const pool: Candidate[] = [];
  for (const row of [...placeRows, ...siteRows]) {
    if (anchorIds.has(row.id)) {
      const c = toCandidate(row, true);
      if (c) anchors.push(c);
    } else {
      const c = toCandidate(row, false);
      if (c) pool.push(c);
    }
  }

  // Dish anchors resolve to their best serving place (highest loved_count) and walk
  // to that place's coords; the step keeps type 'dish' so the UI can show the dish.
  for (const dishId of intent.anchors.dishIds) {
    const { rows } = await db.execute(sql`
      SELECT d.id, d.name_en AS "nameEn", d.name_th AS "nameTh", d.description,
             p.lat, p.lng, p.price_band AS "priceBand"
      FROM dishes d
      JOIN place_dishes pd ON pd.dish_id = d.id
      JOIN places p ON p.id = pd.place_id
      WHERE d.id = ${dishId} AND p.lat IS NOT NULL
      ORDER BY pd.loved_count DESC
      LIMIT 1`);
    const r = rows[0] as { id: string; nameEn: string; nameTh: string | null;
      description: string | null; lat: number; lng: number; priceBand: number | null } | undefined;
    if (!r) continue;
    anchors.push({
      type: 'dish', id: r.id, name: r.nameEn, nameTh: r.nameTh,
      lat: r.lat, lng: r.lng, summary: r.description, vibeTags: [], priceBand: r.priceBand,
      distanceM: haversineM(intent.start, r), score: 1, vibeScore: 0, anchor: true,
    });
  }

  pool.sort((a, b) => b.score - a.score);
  const cap = Math.max(SHORTLIST_CAP, anchors.length);
  const selected = pool.slice(0, Math.max(0, cap - anchors.length));

  // Food is central to this app — guarantee ≥1 food (place/dish) survives the cut so the
  // router can always build a food-bearing walk, even in sight-dense areas where every
  // temple out-scores every eatery. pool is score-sorted, so the first food is the best.
  const isFood = (c: Candidate) => c.type !== 'site';
  if (![...anchors, ...selected].some(isFood)) {
    const topFood = pool.find(isFood);
    if (topFood) {
      if (selected.length >= cap - anchors.length && selected.length > 0) selected.pop();
      selected.push(topFood);
    }
  }

  const candidates = [...anchors, ...selected];
  return { candidates, degraded };
}
