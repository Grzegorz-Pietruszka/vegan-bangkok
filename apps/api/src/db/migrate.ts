import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
// Railway private DNS (postgres.railway.internal) is IPv6-only; pg ignores a `family` option
// (net.connect(port, host) resolves any-family on Node 24), so no extra config is needed here.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
await pool.end();
console.log('drizzle: migrations applied');
