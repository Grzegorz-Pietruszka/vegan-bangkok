import { eq, isNull, and, sql } from 'drizzle-orm';
import { db as defaultDb, type DB } from '../db/index.ts';
import { places } from '../db/schema.ts';
import { normalizeName, sqlNormName } from '../search/normalize.ts';
import { isVibeTag } from '../enrich/vibeVocab.ts';
import type { CanonicalPlace } from '../enrich/adapters/types.ts';
import type { DerivedPlace } from '../enrich/derive.ts';

// Reusable catalog write layer (plan 09) — pure DB functions, no HTTP. The admin
// dashboard reuses these. Facts and derived data are written by SEPARATE calls so a
// derive failure leaves a fact-only row (enrichedAt null) that a later run completes.

/** Upsert source facts. Match precedence: googlePlaceId, then normalized curated name
 * (claims a hand-seeded row instead of duplicating it). Explicit fact projection —
 * transient `_` derive inputs can never reach a column. Returns the place id. */
export async function upsertPlace(facts: CanonicalPlace, db: DB = defaultDb): Promise<string> {
  const factCols = {
    name: facts.name ?? undefined, // undefined = leave existing name untouched
    lat: facts.lat, lng: facts.lng, hours: facts.hours, priceBand: facts.priceBand,
    googlePlaceId: facts.googlePlaceId, source: facts.source,
    fetchedAt: facts.fetchedAt, updatedAt: new Date(),
  };

  let [existing] = await db.select({ id: places.id }).from(places)
    .where(eq(places.googlePlaceId, facts.googlePlaceId));
  if (!existing && facts.name) {
    [existing] = await db.select({ id: places.id }).from(places)
      .where(and(
        isNull(places.googlePlaceId),
        sql`${sqlNormName(sql`${places.name}`)} = ${normalizeName(facts.name)}`,
      ));
  }

  if (existing) {
    await db.update(places).set(factCols).where(eq(places.id, existing.id));
    return existing.id;
  }
  if (!facts.name) throw new Error(`upsertPlace ${facts.googlePlaceId}: new place needs a name`);
  const [row] = await db.insert(places).values({ ...factCols, name: facts.name })
    .returning({ id: places.id });
  return row.id;
}

/** Write the derived layer and stamp enrichedAt. Re-validates the vibe vocab —
 * the write layer does not trust its caller. */
export async function setDerived(
  googlePlaceId: string, derived: DerivedPlace, db: DB = defaultDb,
): Promise<void> {
  const offVocab = derived.vibeTags.filter((t) => !isVibeTag(t));
  if (offVocab.length) {
    throw new Error(`setDerived ${googlePlaceId}: off-vocab vibe tags: ${offVocab.join(', ')}`);
  }
  const now = new Date();
  const updated = await db.update(places).set({
    summary: derived.summary, vibeTags: [...derived.vibeTags],
    embeddingInput: derived.embeddingInput, embedding: derived.embedding,
    embeddingModel: derived.embeddingModel, embeddedAt: now,
    enrichedAt: now, updatedAt: now,
  }).where(eq(places.googlePlaceId, googlePlaceId)).returning({ id: places.id });
  if (updated.length === 0) throw new Error(`setDerived: no place with googlePlaceId ${googlePlaceId}`);
}
