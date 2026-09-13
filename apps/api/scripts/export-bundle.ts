// Shim (Task 1 pattern): exportBundle moved to @vegan-bangkok/db/export-bundle so the
// admin app can call it — bundled app code can't use `new URL(rel, import.meta.url)`
// for filesystem paths (Turbopack rewrites it to a static-asset reference), while the
// externalized db package runs as real Node code. Importers keep this path.
// Run directly: node --env-file-if-exists=.env scripts/export-bundle.ts
import { exportBundle } from '@vegan-bangkok/db/export-bundle';
import { pool } from '../src/db/index.ts';

export { exportBundle };

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await exportBundle();
  console.log(`exported ${r.dishes} dishes, ${r.places} places`);
  await pool.end();
}
