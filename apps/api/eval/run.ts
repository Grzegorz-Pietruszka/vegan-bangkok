// Route-aware eval: drives the REAL /search route (all three tiers + embedding cache)
// via app.inject, with the paid embedder wrapped in a call counter. Gate for plan 08:
//   • a query that normalizes to a full dish name answers via Tier 1 ('name'), zero embed calls
//   • every other query answers via Tier 2 ('semantic') with the expected dish at top-1
//   • pass 2 over the same queries makes zero embed calls (cache warm — proves the
//     degrade-silently cache actually engages, not just fails quietly)
// Exits 1 on any violation so this can gate CI.
import { buildApp } from '../src/app.ts';
import { pool } from '../src/db/index.ts';
import { embed } from '../src/embed/gemini.ts';
import { normalizeName } from '../src/search/normalize.ts';
import queries from './queries.json' with { type: 'json' };

let embedCalls = 0;
const app = await buildApp({
  embedFn: (texts) => { embedCalls += 1; return embed(texts, 'RETRIEVAL_QUERY'); },
});
app.log.level = 'silent'; // eval output only — per-request logs would drown the report

// Cold start: the cache is an optimization (degrade-to-miss), safe to clear; makes the
// pass-1 "% skipped Gemini" stat deterministic across re-runs.
await pool.query('truncate query_embedding_cache');

// Classify name-form queries from the DB, not a hardcoded list — same normalizer as Tier 1.
const { rows: dishRows } = await pool.query('select name_en, name_th from dishes');
const dishNames = new Set(
  dishRows.flatMap((d) => [d.name_en, d.name_th]).map((n) => normalizeName(n ?? '')).filter(Boolean),
);
const isNameForm = (q: string) => dishNames.has(normalizeName(q));

let violations = 0;

async function runPass(label: string): Promise<number> {
  let hits = 0;
  const tiers: Record<string, number> = {};
  const passStart = embedCalls;
  for (const { q, expectDish } of queries) {
    const before = embedCalls;
    const res = await app.inject({ method: 'POST', url: '/search', payload: { q, limit: 5 } });
    const { results, matchType } = res.json();
    const delta = embedCalls - before;
    tiers[matchType] = (tiers[matchType] ?? 0) + 1;

    const problems: string[] = [];
    if (res.statusCode !== 200) problems.push(`status ${res.statusCode}`);
    if (results?.[0]?.nameEn === expectDish) hits += 1;
    else problems.push(`top-1 was "${results?.[0]?.nameEn}"`);
    if (isNameForm(q)) {
      if (matchType !== 'name') problems.push(`expected tier 'name', got '${matchType}'`);
      if (delta !== 0) problems.push(`${delta} embed call(s) on a name-form query`);
    } else if (matchType !== 'semantic') {
      problems.push(`expected tier 'semantic', got '${matchType}'`);
    }
    if (problems.length) violations += 1;

    console.log(
      `${problems.length ? 'FAIL' : 'PASS'}  [${matchType}] "${q}" → ` +
      `${(results ?? []).slice(0, 3).map((r: { nameEn: string }) => r.nameEn).join(', ')}` +
      (problems.length ? `  ← ${problems.join('; ')}` : ''),
    );
  }
  const calls = embedCalls - passStart;
  const skippedPct = Math.round((100 * (queries.length - calls)) / queries.length);
  console.log(
    `\n${label}: top-1 ${hits}/${queries.length} · tiers ${JSON.stringify(tiers)} · ` +
    `embed calls ${calls} · ${skippedPct}% of queries skipped Gemini\n`,
  );
  return calls;
}

await runPass('pass 1 (cold cache)');
const warmCalls = await runPass('pass 2 (warm cache)');
if (warmCalls !== 0) {
  violations += 1;
  console.error(`GATE: warm pass made ${warmCalls} embed call(s) — cache not engaging`);
}

console.log(violations ? `GATE FAIL: ${violations} violation(s)` : 'GATE PASS');
process.exitCode = violations ? 1 : 0;
await app.close();
await pool.end();
