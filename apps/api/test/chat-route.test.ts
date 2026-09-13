import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql, eq } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { seedDatabase } from '../seed/seed.ts';
import { dishes } from '../src/db/schema.ts';
import { buildApp } from '../src/app.ts';

const e = (i: number) => { const v = new Array(1536).fill(0); v[i] = 1; return v; };
const embedOk = async (texts: string[]) => texts.map(() => e(0));
async function* ollamaOk() { yield 'Try '; yield 'khao soi.'; }
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
async function app(opts: Record<string, unknown> = {}) {
  const a = await buildApp({ embedFn: embedOk, ollamaFn: () => ollamaOk(), ...opts });
  apps.push(a);
  return a;
}

// SSE body arrives as one buffered payload under inject(); parse frames from it.
function frames(payload: string): { event: string; data: string }[] {
  return payload.trim().split('\n\n').map((block) => {
    const ev = /event: (.+)/.exec(block)?.[1] ?? '';
    const data = /data: (.+)/.exec(block)?.[1] ?? '';
    return { event: ev, data };
  });
}

before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes, historic_sites, query_embedding_cache RESTART IDENTITY CASCADE`);
  await seedDatabase(db);
  const all = await db.select().from(dishes);
  await db.update(dishes).set({ embedding: e(0) }).where(eq(dishes.id, all[0].id));
});
after(async () => { for (const a of apps) await a.close(); await pool.end(); });

test('happy path: results frame first, then tokens, then done', async () => {
  const a = await app();
  const res = await a.inject({ method: 'POST', url: '/chat', payload: { q: 'noodles' } });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] as string, /text\/event-stream/);
  const fs = frames(res.payload);
  assert.equal(fs[0].event, 'results');
  const results = JSON.parse(fs[0].data).results;
  assert.ok(Array.isArray(results) && results.length >= 1);
  const tokens = fs.filter((f) => f.event === 'token').map((f) => JSON.parse(f.data).t).join('');
  assert.equal(tokens, 'Try khao soi.');
  assert.equal(fs[fs.length - 1].event, 'done');
  assert.equal(JSON.parse(fs[fs.length - 1].data).degraded, undefined);
});

test('ollama throws → template token + done degraded:generation', async () => {
  async function* boom(): AsyncIterable<string> { throw new Error('ollama down'); }
  const a = await app({ ollamaFn: () => boom() });
  const res = await a.inject({ method: 'POST', url: '/chat', payload: { q: 'noodles' } });
  const fs = frames(res.payload);
  assert.equal(fs[0].event, 'results');
  const tokens = fs.filter((f) => f.event === 'token');
  assert.equal(tokens.length, 1, 'expected exactly one template token');
  assert.equal(JSON.parse(fs[fs.length - 1].data).degraded, 'generation');
});

test('embedder throws → retrieval degraded, still streams', async () => {
  const a = await app({ embedFn: async () => { throw new Error('gemini down'); } });
  const res = await a.inject({ method: 'POST', url: '/chat', payload: { q: 'tofu' } });
  const fs = frames(res.payload);
  assert.equal(fs[0].event, 'results');
  assert.equal(JSON.parse(fs[fs.length - 1].data).degraded, 'retrieval');
});

test('no results → template line, no generation call', async () => {
  let generationCalled = false;
  async function* spy() { generationCalled = true; yield 'x'; }
  const a = await app({
    embedFn: async () => { throw new Error('down'); },  // full-text path
    ollamaFn: () => spy(),
  });
  const res = await a.inject({ method: 'POST', url: '/chat',
    payload: { q: 'zzzz-no-such-dish-anywhere' } });
  const fs = frames(res.payload);
  assert.deepEqual(JSON.parse(fs[0].data).results, []);
  assert.equal(generationCalled, false);
  assert.equal(fs.filter((f) => f.event === 'token').length, 1);
});

test('validation: empty q → 400, not SSE', async () => {
  const a = await app();
  const res = await a.inject({ method: 'POST', url: '/chat', payload: { q: '' } });
  assert.equal(res.statusCode, 400);
});

test('concurrency cap: second chat during generation → 429', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  async function* slow() { yield 'a'; await gate; yield 'b'; }
  const a = await app({ ollamaFn: () => slow() });
  const first = a.inject({ method: 'POST', url: '/chat', payload: { q: 'one' } });
  await new Promise((r) => setTimeout(r, 100));            // let first reach generation
  const second = await a.inject({ method: 'POST', url: '/chat', payload: { q: 'two' } });
  assert.equal(second.statusCode, 429);
  release();
  assert.equal((await first).statusCode, 200);
});

test('concurrency cap: second chat during retrieval → 429', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let embedCalls = 0;
  const gatedEmbed = async (texts: string[]) => {
    embedCalls += 1;
    if (embedCalls === 1) await gate;          // park only the FIRST request inside retrieval
    return texts.map(() => e(0));
  };
  // fresh queries — 'one'/'two' were embedding-cached by the previous test, which would
  // let retrieval skip the gated embed entirely.
  const a = await app({ embedFn: gatedEmbed });
  const first = a.inject({ method: 'POST', url: '/chat', payload: { q: 'three' } });
  await new Promise((r) => setTimeout(r, 100));            // let first park in retrieval
  const second = await a.inject({ method: 'POST', url: '/chat', payload: { q: 'four' } });
  release();                                   // un-park first before asserting — no hangs on RED
  assert.equal(second.statusCode, 429);
  const res = await first;
  assert.equal(res.statusCode, 200);
  const fs = frames(res.payload);
  assert.equal(fs[0].event, 'results');
  assert.equal(fs[fs.length - 1].event, 'done');
});
