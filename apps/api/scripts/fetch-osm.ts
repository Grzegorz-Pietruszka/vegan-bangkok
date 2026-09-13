// TEST-DATA ONLY (not the curated launch catalog). Pulls vegan/vegetarian places in Bangkok
// from OpenStreetMap via the Overpass API (open data, ODbL) and loads them into the dev DB
// tagged `source='osm_test'` so they never mix with curated rows and can be purged in one line:
//   DELETE FROM places WHERE source='osm_test';
//
// Usage:  node --env-file=.env scripts/fetch-osm-test.ts [--load]
//   (no flag → writes seed/test-osm-bangkok.json only; --load → also inserts into places)
//
// The launch catalog stays human-curated (see AGENTS.md); this is disposable breadth for
// exercising map clustering, search, and the feed while building.
import { writeFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { places } from '../src/db/schema.ts';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
// central Bangkok bbox: S,W,N,E
const BBOX = '13.55,100.35,13.95,100.75';
const QUERY = `[out:json][timeout:60];
(
  nwr["amenity"~"restaurant|cafe|fast_food"]["diet:vegan"~"yes|only"](${BBOX});
  nwr["amenity"~"restaurant|cafe|fast_food"]["diet:vegetarian"~"only"](${BBOX});
  nwr["cuisine"~"vegan|vegetarian"](${BBOX});
);
out center tags;`;

type Tags = Record<string, string>;
type El = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Tags };

// OSM diet tags → the app's veganStatus check-constraint union (test-grade mapping).
function veganStatus(t: Tags): 'fully_vegan' | 'vegetarian_jay' | 'vegan_friendly' {
  if (t['diet:vegan'] === 'only') return 'fully_vegan';
  if (t['diet:vegetarian'] === 'only') return 'vegetarian_jay';
  return 'vegan_friendly';
}

async function main() {
  const load = process.argv.includes('--load');
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'User-Agent': 'VeganBangkokDev/0.1 (local testing)' },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const { elements } = (await res.json()) as { elements: El[] };

  const seen = new Set<string>();
  const rows = elements
    .map((e) => {
      const t = e.tags ?? {};
      const name = t.name || t['name:en'];
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      if (!name || lat == null || lng == null) return null;   // need a name + a pin
      return {
        name,
        nameTh: t['name:th'] ?? null,
        neighbourhood: t['addr:suburb'] ?? t['addr:city'] ?? null,
        lat, lng,
        veganStatus: veganStatus(t),
        hours: t.opening_hours ? { raw: t.opening_hours } : null,
        cuisine: t.cuisine ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));   // dedupe by name

  const outPath = new URL('../seed/test-osm-bangkok.json', import.meta.url).pathname;
  await writeFile(outPath, JSON.stringify({ source: 'osm_test', fetchedFrom: 'overpass', bbox: BBOX, places: rows }, null, 2));
  console.log(`fetched ${elements.length} OSM elements → ${rows.length} named places → ${outPath}`);

  if (load) {
    await db.execute(sql`DELETE FROM places WHERE source = 'osm_test'`);   // clean reload
    for (const r of rows) {
      await db.insert(places).values({
        name: r.name, neighbourhood: r.neighbourhood, lat: r.lat, lng: r.lng,
        veganStatus: r.veganStatus, hours: r.hours, source: 'osm_test', fetchedAt: new Date(),
      });
    }
    const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM places WHERE source='osm_test'`)).rows as { n: number }[];
    console.log(`loaded ${n} osm_test places into the dev DB`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
