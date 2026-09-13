import { db, pool } from '../src/db/index.ts';
import { seedTags } from './tags.ts';
const r = await seedTags(db);
console.log(`tags: ${r.vocab} vocab, ${r.links} links`);
await pool.end();
