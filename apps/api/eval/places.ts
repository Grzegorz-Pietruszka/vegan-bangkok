// Place-search eval: drives the REAL POST /search/places (parser → SLM → 3 arms → RRF →
// rank) via app.inject, with the paid embedder wrapped in a call counter.
//
// Two configurations, so the article-grade numbers are comparable:
//   node eval/places.ts            → SLM disabled (fake pipeline throws) = slice-1 baseline
//   node eval/places.ts --slm      → real Xenova/nli-deberta-v3-xsmall, warmed before the run
//
// Measures: intent accuracy, retrieval top-1/top-5, the vegan guarantee (every row, every
// query), radius containment, fallback rate, latency percentiles, embed-cache effect.
// Writes eval/places-report.json. Exits 1 if the vegan guarantee or a hard invariant breaks.
import { writeFileSync } from 'node:fs';
import { buildApp } from '../src/app.ts';
import { pool } from '../src/db/index.ts';
import { embed } from '../src/embed/gemini.ts';
import { resolveGeo } from '../src/search/placeRetrieval.ts';
import { parsePlaceQuery } from '../src/search/placeParser.ts';
import { classifyIntent, setPipelineForTests, SlmNotReadyError } from '../src/search/slmClassifier.ts';
import type { PlaceSearchIntent, PlaceResult } from '@vegan-bangkok/schemas';
import cases from './places-queries.json' with { type: 'json' };

const USE_SLM = process.argv.includes('--slm');
const VEGAN_OK = new Set(['fully_vegan', 'vegetarian_jay', 'vegan_friendly']);

let embedCalls = 0;
const app = await buildApp({
  embedFn: (texts) => { embedCalls += 1; return embed(texts, 'RETRIEVAL_QUERY'); },
});
app.log.level = 'silent';

// Cache is a degrade-to-miss optimization — safe to clear, makes pass-1 stats deterministic.
await pool.query('truncate query_embedding_cache');

// ── SLM configuration ───────────────────────────────────────────────────────
let warmupMs: number | null = null;
if (USE_SLM) {
  setPipelineForTests(null);
  const t0 = performance.now();
  // classifyIntent throws SlmNotReadyError while the lazy singleton loads — poll it.
  for (;;) {
    try { await classifyIntent('warmup query'); break; } catch (err) {
      if (!(err instanceof SlmNotReadyError)) throw err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  warmupMs = performance.now() - t0;
  console.log(`SLM warm in ${warmupMs.toFixed(0)} ms (model load + first inference)\n`);
} else {
  // Slice-1 baseline: classifier unavailable → low-confidence queries must fall back.
  setPipelineForTests(() => { throw new Error('SLM disabled for baseline run'); });
}

const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};

type Row = {
  q: string; set: string; ms: number; embedDelta: number;
  fallback: boolean; fallbackReason?: string;
  intent: PlaceSearchIntent; results: PlaceResult[];
  problems: string[]; graded: boolean; passed: boolean;
};

function grade(c: any, intent: PlaceSearchIntent, results: PlaceResult[]): { problems: string[]; graded: boolean } {
  const p: string[] = [];
  const e = c.expect;
  if (e) {
    if (e.intentType && intent.intentType !== e.intentType) p.push(`intentType ${intent.intentType} ≠ ${e.intentType}`);
    if ('mode' in e && intent.mode !== e.mode) p.push(`mode ${intent.mode} ≠ ${e.mode}`);
    if (e.primaryLocation && intent.primaryLocation !== e.primaryLocation) p.push(`location ${intent.primaryLocation} ≠ ${e.primaryLocation}`);
    if (e.isBestQuery != null && intent.isBestQuery !== e.isBestQuery) p.push(`isBestQuery ${intent.isBestQuery}`);
    if (e.priceMax != null && intent.hardFilters.priceMax !== e.priceMax) p.push(`priceMax ${intent.hardFilters.priceMax} ≠ ${e.priceMax}`);
    if (e.openNow != null && intent.hardFilters.openNow !== e.openNow) p.push(`openNow ${intent.hardFilters.openNow}`);
    if (e.softPreferences) for (const s of e.softPreferences) {
      if (!intent.softPreferences.includes(s)) p.push(`missing softPreference ${s}`);
    }
    if (e.minConfidence != null && intent.confidence < e.minConfidence) p.push(`confidence ${intent.confidence.toFixed(2)} < ${e.minConfidence}`);
  }
  if (c.expectTop1 && results[0]?.name !== c.expectTop1) p.push(`top-1 "${results[0]?.name}" ≠ "${c.expectTop1}"`);
  if (c.expectInTop5 && !results.slice(0, 5).some((r) => r.name === c.expectInTop5)) p.push(`"${c.expectInTop5}" not in top-5`);
  if (c.expectSlm) {
    const s = c.expectSlm;
    if (s.intentType && !s.intentType.includes(intent.intentType)) p.push(`SLM intentType ${intent.intentType} ∉ [${s.intentType}]`);
    if (s.mode && !s.mode.includes(intent.mode)) p.push(`SLM mode ${intent.mode} ∉ [${s.mode}]`);
  }
  const graded = Boolean(e || c.expectTop1 || c.expectInTop5 || (c.expectSlm && Object.keys(c.expectSlm).length));
  return { problems: p, graded };
}

let violations = 0;   // hard invariants only — these fail the gate

async function runPass(label: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (const c of cases as any[]) {
    const before = embedCalls;
    const t0 = performance.now();
    const res = await app.inject({
      method: 'POST', url: '/search/places',
      payload: { q: c.q, ...(c.lat != null ? { lat: c.lat, lng: c.lng } : {}), limit: 10 },
    });
    const ms = performance.now() - t0;
    if (res.statusCode !== 200) { violations += 1; console.log(`FAIL status ${res.statusCode} "${c.q}"`); continue; }
    const { results, intent, fallback, fallbackReason } = res.json() as any;

    const hard: string[] = [];
    // ── the vegan guarantee: every row, every query, fallback included ──
    for (const r of results as PlaceResult[]) {
      if (!VEGAN_OK.has(r.veganStatus ?? '')) hard.push(`NON-VEGAN ROW "${r.name}" (${r.veganStatus})`);
    }
    if (results.length === 0) hard.push('EMPTY RESULT SET');
    if (intent.hardFilters.vegan !== true) hard.push('vegan filter not true');
    // ── radius containment on geo-scoped queries ──
    const geo = resolveGeo(intent, c.lat != null ? { lat: c.lat, lng: c.lng } : undefined);
    if (geo && !fallback) for (const r of results as PlaceResult[]) {
      if (r.distanceM != null && r.distanceM > geo.radiusM) hard.push(`OUT OF RADIUS "${r.name}" ${Math.round(r.distanceM)}m > ${geo.radiusM}m`);
    }
    // ── price filter honoured ──
    if (intent.hardFilters.priceMax != null) for (const r of results as PlaceResult[]) {
      if (r.priceBand != null && r.priceBand > intent.hardFilters.priceMax) hard.push(`PRICE "${r.name}" band ${r.priceBand}`);
    }
    violations += hard.length;

    const { problems, graded } = grade(c, intent, results);
    const all = [...hard, ...problems];
    rows.push({
      q: c.q, set: c.set, ms, embedDelta: embedCalls - before,
      fallback, fallbackReason, intent, results, problems: all,
      graded, passed: problems.length === 0,
    });
    console.log(
      `${all.length ? 'FAIL' : 'PASS'}  [${c.set}] ${ms.toFixed(0).padStart(4)}ms ` +
      `${fallback ? `FB:${fallbackReason} ` : ''}${intent.intentType}${intent.mode ? `/${intent.mode}` : ''} ` +
      `conf=${intent.confidence.toFixed(2)}  "${c.q}" → ${results.slice(0, 3).map((r: any) => r.name).join(', ')}` +
      (all.length ? `\n        ← ${all.join('; ')}` : ''),
    );
  }
  console.log(`\n--- ${label}: p50 ${pct(rows.map(r => r.ms), 50).toFixed(0)}ms · p95 ${pct(rows.map(r => r.ms), 95).toFixed(0)}ms · embed calls ${rows.reduce((a, r) => a + r.embedDelta, 0)}\n`);
  return rows;
}

console.log(`=== pass 1 (cold embedding cache) · SLM ${USE_SLM ? 'ON' : 'OFF (baseline)'} ===`);
const pass1 = await runPass('pass 1');
console.log('=== pass 2 (warm embedding cache) ===');
const pass2 = await runPass('pass 2');

// ── deterministic parser microbenchmark (no DB, no model) ──
const parseSamples: number[] = [];
for (const c of cases as any[]) {
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) parsePlaceQuery(c.q, { hasUserLoc: c.lat != null, knownEntities: [] });
  parseSamples.push((performance.now() - t0) / 100);
}

// ── SLM inference-only latency, measured directly ──
let slmSamples: number[] = [];
if (USE_SLM) {
  for (const c of (cases as any[]).filter((c) => c.set === 'slm')) {
    const t0 = performance.now();
    await classifyIntent(c.q);
    slmSamples.push(performance.now() - t0);
  }
}

const bySet = (rows: Row[], set: string) => rows.filter((r) => r.set === set);
const acc = (rows: Row[]) => {
  const g = rows.filter((r) => r.graded);
  return { graded: g.length, passed: g.filter((r) => r.passed).length };
};

const summary = {
  config: { slm: USE_SLM, warmupMs, places: (await pool.query('select count(*)::int c from places')).rows[0].c },
  cases: cases.length,
  hardViolations: violations,
  accuracy: {
    deterministic: acc(bySet(pass1, 'deterministic')),
    retrieval: acc(bySet(pass1, 'retrieval')),
    slm: acc(bySet(pass1, 'slm')),
  },
  fallbackRate: {
    all: pass1.filter((r) => r.fallback).length / pass1.length,
    slmSet: bySet(pass1, 'slm').filter((r) => r.fallback).length / bySet(pass1, 'slm').length,
  },
  latencyMs: {
    pass1: { p50: pct(pass1.map(r => r.ms), 50), p95: pct(pass1.map(r => r.ms), 95), max: Math.max(...pass1.map(r => r.ms)) },
    pass2: { p50: pct(pass2.map(r => r.ms), 50), p95: pct(pass2.map(r => r.ms), 95), max: Math.max(...pass2.map(r => r.ms)) },
    parserOnly: { p50: pct(parseSamples, 50), p95: pct(parseSamples, 95) },
    slmInference: USE_SLM ? { p50: pct(slmSamples, 50), p95: pct(slmSamples, 95), n: slmSamples.length } : null,
  },
  embedCalls: { pass1: pass1.reduce((a, r) => a + r.embedDelta, 0), pass2: pass2.reduce((a, r) => a + r.embedDelta, 0) },
  rowsChecked: pass1.reduce((a, r) => a + r.results.length, 0),
  perCase: pass1.map((r) => ({
    q: r.q, set: r.set, ms: Math.round(r.ms), fallback: r.fallback, fallbackReason: r.fallbackReason,
    intentType: r.intent.intentType, mode: r.intent.mode, location: r.intent.primaryLocation,
    confidence: Number(r.intent.confidence.toFixed(2)), top3: r.results.slice(0, 3).map((x) => x.name),
    problems: r.problems,
  })),
};

const out = `eval/places-report${USE_SLM ? '-slm' : '-baseline'}.json`;
writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, perCase: undefined }, null, 2));
console.log(`\nreport → ${out}`);
console.log(violations === 0 ? 'GATE PASS' : `GATE FAIL — ${violations} hard invariant violation(s)`);

await app.close();
await pool.end();
process.exit(violations === 0 ? 0 : 1);
