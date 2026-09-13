import { eq } from 'drizzle-orm';
import { db as defaultDb, type DB } from '../db/index.ts';
import { places } from '../db/schema.ts';
import type { SourceAdapter, CanonicalPlace } from './adapters/types.ts';
import { mergeCanonical } from './merge.ts';
import { derivePlace, type DerivedPlace } from './derive.ts';
import { upsertPlace, setDerived } from '../catalog/places.ts';

// Bootstrap enrichment runner (plan 09). This same loop becomes the refresh cron
// later — swap the skip condition from "enrichedAt set" to "fetchedAt older than N".
const HARD_STOP_AFTER = 3; // consecutive fetch/derive failures → abort (quota/network is down, don't burn the list)

export type EnrichSummary = {
  enriched: number; partial: number; notFound: number;
  skipped: number; failed: number; aborted: boolean;
};

export type EnrichDeps<Raw> = {
  adapter: SourceAdapter<string, Raw>;
  derive?: (merged: CanonicalPlace) => Promise<DerivedPlace>;
  db?: DB;
  delayMs?: number;
};

export async function enrichPlaces<Raw>(
  ids: string[],
  opts: { force?: boolean; limit?: number } = {},
  deps: EnrichDeps<Raw>,
): Promise<EnrichSummary> {
  const { adapter, derive = derivePlace, db = defaultDb, delayMs = 200 } = deps;
  const list = opts.limit != null ? ids.slice(0, opts.limit) : ids;
  const s: EnrichSummary = { enriched: 0, partial: 0, notFound: 0, skipped: 0, failed: 0, aborted: false };
  let consecutiveFailures = 0;

  for (const id of list) {
    if (!opts.force) {
      // skip check BEFORE fetch — re-runs must not spend Places quota on done rows
      const [row] = await db.select({ enrichedAt: places.enrichedAt }).from(places)
        .where(eq(places.googlePlaceId, id));
      if (row?.enrichedAt) { s.skipped++; continue; }
    }

    let raw: Raw | null;
    try {
      raw = await adapter.fetch(id);
    } catch (err) {
      console.error(`fetch failed for ${id}:`, err);
      s.failed++;
      if (++consecutiveFailures >= HARD_STOP_AFTER) { s.aborted = true; break; }
      continue;
    }
    if (raw === null) { s.notFound++; consecutiveFailures = 0; continue; }

    const canonical = adapter.toCanonical(raw);
    if (canonical._closed) { s.skipped++; consecutiveFailures = 0; continue; }

    const merged = mergeCanonical([canonical]);
    await upsertPlace(merged, db); // facts land even if derive fails below
    try {
      const derived = await derive(merged);
      await setDerived(merged.googlePlaceId, derived, db);
      s.enriched++;
      consecutiveFailures = 0;
    } catch (err) {
      console.error(`derive failed for ${id} (facts saved, enrichedAt left null):`, err);
      s.partial++;
      if (++consecutiveFailures >= HARD_STOP_AFTER) { s.aborted = true; break; }
    }

    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs)); // be polite to both APIs
  }
  return s;
}
