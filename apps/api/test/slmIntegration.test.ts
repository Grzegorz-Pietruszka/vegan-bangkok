import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent, SlmNotReadyError } from '../src/search/slmClassifier.ts';

// Real-model smoke: downloads ~70MB on first run. Excluded from CI/npm test by the gate.
const gated = process.env.SLM_TEST === '1' ? test : test.skip;

gated('real model classifies canonical queries', { timeout: 120_000 }, async () => {
  // first call kicks off the lazy load — poll until ready
  for (;;) {
    try { await classifyIntent('warmup'); break; }
    catch (err) { if (err instanceof SlmNotReadyError) { await new Promise((r) => setTimeout(r, 500)); continue; } throw err; }
  }
  const cases: [string, string][] = [
    ['somewhere chill to grab dinner tonight', 'discovery'],
    ['top rated brunch spots', 'best'],
    ['secret local places tourists dont know', 'discovery'],  // + mode hidden_gems
  ];
  for (const [q, expected] of cases) {
    const r = await classifyIntent(q);
    assert.equal(r.intentType, expected, q);
  }
  const gems = await classifyIntent('secret local places tourists dont know');
  assert.equal(gems.mode, 'hidden_gems');
});
