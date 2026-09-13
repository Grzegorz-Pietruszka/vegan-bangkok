import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
export * from './schema.js';
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
export const db = drizzle({ client: pool, schema });
export type DB = typeof db;
export * from './introspect.js';
