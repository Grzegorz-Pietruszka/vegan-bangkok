// TEST-DATA enrichment: resolve the osm_test places (name + coords, no Google ID) to their
// Google place via Text Search, attach the ID to that exact row, then run the existing grounded
// enrich pipeline (Google facts → summary + vibe_tags + embedding). Enriches IN PLACE — no
// duplicate rows. Resolved rows flip source osm_test → google_places (real Google data now);
// unresolved rows stay osm_test with no vibes.
//
// Spends Google (Text Search + Details) and Gemini (derive + embed) per place. Usage:
//   node --env-file=.env scripts/enrich-osm-test.ts [--limit N]
import { parseArgs } from 'node:util';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { googlePlaces } from '../src/enrich/adapters/googlePlaces.ts';
import { enrichPlaces } from '../src/enrich/run.ts';

const { values } = parseArgs({ options: { limit: { type: 'string' } } });
const KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!KEY) { console.error('GOOGLE_PLACES_API_KEY missing'); process.exit(1); }

async function resolvePlaceId(name: string, lat: number, lng: number): Promise<string | null> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY!,
      'X-Goog-FieldMask': 'places.id',
    },
    body: JSON.stringify({
      textQuery: `${name} Bangkok`,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 1000 } },
    }),
  });
  if (!res.ok) { console.error(`  textSearch ${res.status} for ${name}`); return null; }
  const { places } = (await res.json()) as { places?: { id: string }[] };
  return places?.[0]?.id ?? null;   // top candidate within the location bias
}

const rows = (await db.execute(sql`
  SELECT id, name, lat, lng FROM places
  WHERE source = 'osm_test' AND google_place_id IS NULL AND lat IS NOT NULL AND lng IS NOT NULL
  ORDER BY name`)).rows as { id: string; name: string; lat: number; lng: number }[];

const list = values.limit ? rows.slice(0, Number(values.limit)) : rows;
console.log(`resolving ${list.length} osm_test places → Google place IDs…`);

// google_place_id is UNIQUE — track ids already taken (by these rows or pre-existing) to skip dupes
const taken = new Set(
  ((await db.execute(sql`SELECT google_place_id AS id FROM places WHERE google_place_id IS NOT NULL`)).rows as { id: string }[])
    .map((r) => r.id),
);
const resolvedIds: string[] = [];
let noMatch = 0, dupe = 0;
for (const r of list) {
  const gid = await resolvePlaceId(r.name, r.lat, r.lng);
  if (!gid) { noMatch++; continue; }
  if (taken.has(gid)) { dupe++; continue; }   // another OSM entry for the same venue
  taken.add(gid);
  await db.execute(sql`UPDATE places SET google_place_id = ${gid} WHERE id = ${r.id}::uuid`);
  resolvedIds.push(gid);
}
console.log(`resolved ${resolvedIds.length}; no Google match ${noMatch}; duplicate venue ${dupe}`);

console.log(`enriching ${resolvedIds.length} places (Google facts → summary/vibes/embedding)…`);
const s = await enrichPlaces(resolvedIds, {}, { adapter: googlePlaces, db });
console.log(`enriched ${s.enriched}, partial ${s.partial}, notFound ${s.notFound}, ` +
  `skipped ${s.skipped}, failed ${s.failed}${s.aborted ? ' — ABORTED (repeated failures)' : ''}`);
await pool.end();
process.exitCode = s.aborted ? 1 : 0;
