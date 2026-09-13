// Exports the seeded dish catalog (Greg's curated corpus, canonical DB UUIDs) into the
// mobile app bundle. Rerunnable — this becomes the catalog pipeline when the real
// ~200-place data lands. CLI entry: apps/api/scripts/export-bundle.ts (shim).
//
// Lives in packages/db (not apps/api) because the admin app's "Re-export bundle" action
// calls it. Two Turbopack findings drove the shape of the path code below (Task 8):
//   1. `new URL(<literal>, import.meta.url)` in ANY bundled code is rewritten into a
//      static-asset reference (observed: ENOENT writing /_next/static/media/dishes.*.json).
//   2. serverExternalPackages does NOT externalize this symlinked workspace package —
//      Turbopack bundles dist/export-bundle.js anyway (even after a cold .next).
// But plain `import.meta.url` is preserved as the original source-file URL (probed:
// file:///…/src/lib/termActions.ts), so fileURLToPath + path.resolve works both bundled
// and under plain Node. Do NOT call pool.end() here — the admin reuses the shared pool.
//
// Path note: src/ and dist/ are both one level under packages/db, so ../../.. reaches
// the repo root from either.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db } from './index.js';

const dataDir = resolve(fileURLToPath(import.meta.url), '../../../..', 'apps/mobile/assets/data');

export async function exportBundle(): Promise<{ dishes: number; places: number }> {
  const { rows } = await db.execute(sql`
    SELECT d.id, d.name_en AS "nameEn", d.name_th AS "nameTh", d.description,
      d.spice_level AS "spiceLevel",
      coalesce((SELECT array_agg(tg.name_en ORDER BY tg.name_en) FROM dish_tags dt
                JOIN tags tg ON tg.id = dt.tag_id WHERE dt.dish_id = d.id), '{}') AS tags,
      d.order_phrase AS "orderPhrase", d.skip_ingredients AS "skipIngredients",
      r.name AS "regionName",
      coalesce(json_agg(json_build_object(
        'name', p.name, 'verifiedVegan', pd.verified_vegan, 'lovedCount', pd.loved_count
      ) ORDER BY p.name) FILTER (WHERE p.id IS NOT NULL), '[]') AS places
    FROM dishes d
    LEFT JOIN regions r ON r.id = d.region_id
    LEFT JOIN place_dishes pd ON pd.dish_id = d.id
    LEFT JOIN places p ON p.id = pd.place_id
    GROUP BY d.id, r.name
    ORDER BY d.name_en`);

  writeFileSync(resolve(dataDir, 'dishes.json'), JSON.stringify(rows, null, 2) + '\n');

  // Places bundle (map catalog). Coalesces to satisfy the shared Place schema the mobile
  // bundle test validates (neighbourhood/priceBand/hours are non-null there). `verified` is
  // the place-level trust rollup: true iff any team-verified dish at this place → green pin.
  // Includes source='osm_test' rows when present, so the map shows test breadth in dev.
  const { rows: placeRows } = await db.execute(sql`
    SELECT p.id, p.name, coalesce(p.neighbourhood, '') AS "neighbourhood",
      p.lat, p.lng, p.vegan_status AS "veganStatus",
      coalesce(p.price_band, 2) AS "priceBand",
      coalesce(p.hours, '{}'::jsonb) AS hours,
      p.nearest_station AS "nearestStation", p.photo_url AS "photoUrl",
      p.summary, coalesce(p.vibe_tags, '{}') AS "vibeTags",
      EXISTS(SELECT 1 FROM place_dishes pd WHERE pd.place_id = p.id AND pd.verified_vegan) AS verified
    FROM places p
    WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL AND p.vegan_status IS NOT NULL
    ORDER BY p.name`);

  writeFileSync(resolve(dataDir, 'places.json'), JSON.stringify(placeRows, null, 2) + '\n');

  return { dishes: rows.length, places: placeRows.length };
}
