import { db, pool } from '../src/db/index.ts';
import { seedDatabase } from './seed.ts';
import { seedTags } from './tags.ts';
await seedDatabase(db);
console.log('seeded');
const r = await seedTags(db);
console.log(`tags: ${r.vocab} vocab, ${r.links} links`);
await pool.end();
