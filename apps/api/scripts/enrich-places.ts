// Bootstrap: hydrate curated places from Google Places and derive summary/vibe/embedding.
// Usage: npm run enrich [-- --force --ids ChIJa,ChIJb --limit 10]
// Reads seed/place-ids.json (curated place_ids — human-provided, never fabricated).
//
// Also imported by the admin re-enrich action (Task 9), so module scope must stay
// side-effect free: arg parsing, the env assert, the seed read, and the batch run all
// live inside the direct-run guard (Task 8 pattern, see scripts/export-bundle.ts).
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { places } from '../src/db/schema.ts';
import { googlePlaces } from '../src/enrich/adapters/googlePlaces.ts';
import { enrichPlaces } from '../src/enrich/run.ts';

// Re-enrich one place by DB row id (admin button): forced fresh Google fetch + derive
// even if enrichedAt is set. Does NOT end the pool — the caller owns its lifecycle.
export async function enrichPlaceById(id: string): Promise<void> {
  if (!process.env.GOOGLE_PLACES_API_KEY) throw new Error('GOOGLE_PLACES_API_KEY missing');
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  const [row] = await db.select({ googlePlaceId: places.googlePlaceId })
    .from(places).where(eq(places.id, id));
  if (!row) throw new Error(`no place with id ${id}`);
  if (!row.googlePlaceId) throw new Error('place has no google_place_id — set one, then re-enrich');
  const s = await enrichPlaces([row.googlePlaceId], { force: true },
    { adapter: googlePlaces, db, delayMs: 0 });
  if (s.enriched === 1) return;
  if (s.notFound) throw new Error(`Google Places has no result for ${row.googlePlaceId}`);
  if (s.skipped) throw new Error('Google reports this place as closed — not enriched');
  if (s.partial) throw new Error('facts saved, but summary/embedding failed — check GEMINI_API_KEY and server logs');
  throw new Error('enrichment failed — see server logs');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: {
    force: { type: 'boolean', default: false },
    ids: { type: 'string' },
    limit: { type: 'string' },
  } });

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error('GOOGLE_PLACES_API_KEY missing — set it in apps/api/.env');
    process.exit(1);
  }

  const ids: string[] = values.ids
    ? values.ids.split(',').map((s) => s.trim()).filter(Boolean)
    : JSON.parse(readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), '../seed/place-ids.json'), 'utf8'));

  const s = await enrichPlaces(ids,
    { force: values.force, limit: values.limit ? Number(values.limit) : undefined },
    { adapter: googlePlaces, db });

  console.log(`enriched ${s.enriched}, partial ${s.partial}, notFound ${s.notFound}, ` +
    `skipped ${s.skipped}, failed ${s.failed}${s.aborted ? ' — ABORTED after repeated failures' : ''}`);
  await pool.end();
  process.exitCode = s.aborted ? 1 : 0;
}
