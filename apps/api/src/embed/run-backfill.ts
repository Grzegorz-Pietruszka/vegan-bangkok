import { db, pool } from '../db/index.ts';
import { embed } from './gemini.ts';
import { backfillEmbeddings, backfillSiteEmbeddings } from './job.ts';
const n = await backfillEmbeddings(db, (texts) => embed(texts, 'RETRIEVAL_DOCUMENT'));
console.log(`embedded ${n} dishes`);
const s = await backfillSiteEmbeddings(db, (texts) => embed(texts, 'RETRIEVAL_DOCUMENT'));
console.log(`embedded ${s} historic sites`);
await pool.end();
