import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaceQuery, classifyIntentSLM } from '../src/search/placeParser.ts';
import { setPipelineForTests, type ZeroShotFn } from '../src/search/slmClassifier.ts';

const cases: [string, Parameters<typeof parsePlaceQuery>[1], Partial<ReturnType<typeof parsePlaceQuery>>][] = [
  ['best vegan restaurant in Thonglor', {},
    { intentType: 'best', isBestQuery: true, primaryLocation: 'Thonglor' }],
  ['hidden gem cafe ทองหล่อ', {},
    { mode: 'hidden_gems', intentType: 'discovery', primaryLocation: 'Thonglor' }],
  ['pad thai near me', { hasUserLoc: true, knownEntities: ['pad thai'] },
    { intentType: 'nearby', entities: ['pad thai'], primaryLocation: null }],
  ['pad thai', { knownEntities: ['pad thai'] },
    { intentType: 'entity', entities: ['pad thai'] }],
  ['cheap eats open now in yaowarat', {},
    { primaryLocation: 'Chinatown' }],
  ['quiet rooftop place sukhumvit', {},
    { softPreferences: ['quiet', 'rooftop'], primaryLocation: 'Sukhumvit', intentType: 'discovery' }],
  ['plan a vegan food crawl in chinatown', {},
    { intentType: 'planning', primaryLocation: 'Chinatown' }],
];

for (const [q, opts, expected] of cases) {
  test(`parse: "${q}"`, () => {
    const got = parsePlaceQuery(q, opts);
    for (const [k, v] of Object.entries(expected)) assert.deepEqual((got as any)[k], v, k);
    assert.ok(got.hardFilters.vegan === true);
  });
}

test('cheap → priceMax 2, open now → openNow true', () => {
  const got = parsePlaceQuery('cheap eats open now in yaowarat');
  assert.equal(got.hardFilters.priceMax, 2);
  assert.equal(got.hardFilters.openNow, true);
});

test('high confidence when all tokens explained', () => {
  assert.ok(parsePlaceQuery('best vegan restaurant in Thonglor').confidence >= 0.7);
});

test('garbage query → low confidence, discovery default, full semanticQuery', () => {
  const got = parsePlaceQuery('xzqw florble something weird');
  assert.ok(got.confidence < 0.7);
  assert.equal(got.intentType, 'discovery');
  assert.ok(got.semanticQuery.includes('florble'));
});

test('"near me" without user location does not become nearby', () => {
  assert.notEqual(parsePlaceQuery('vegan near me', { hasUserLoc: false }).intentType, 'nearby');
});

const slmTop = (topLabel: string): ZeroShotFn => async (_t, labels) => ({
  labels: [topLabel, ...labels.filter((l) => l !== topLabel)],
  scores: labels.map((_, i) => (i === 0 ? 0.9 : 0.01)),
});

test('classifyIntentSLM: high confidence bypasses the SLM entirely', async () => {
  setPipelineForTests(async () => { throw new Error('must not be called'); });
  const draft = parsePlaceQuery('best vegan restaurant in Thonglor'); // confidence >= 0.7
  assert.equal(await classifyIntentSLM('best vegan restaurant in Thonglor', draft), draft);
  setPipelineForTests(null);
});

test('classifyIntentSLM: low confidence gets intentType/mode, everything else untouched', async () => {
  setPipelineForTests(slmTop('secret hidden gems that few tourists know about'));
  const draft = parsePlaceQuery('xzqw florble something weird'); // confidence < 0.7
  const out = await classifyIntentSLM('xzqw florble something weird', draft);
  assert.equal(out.intentType, 'discovery');
  assert.equal(out.mode, 'hidden_gems');
  const { intentType: _a, mode: _b, ...restOut } = out;
  const { intentType: _c, mode: _d, ...restDraft } = draft;
  assert.deepEqual(restOut, restDraft, 'only intentType/mode may change');
  setPipelineForTests(null);
});

test('classifyIntentSLM: nearby without user location downgrades to discovery', async () => {
  setPipelineForTests(slmTop('places within walking distance of my current gps location'));
  const draft = parsePlaceQuery('xzqw florble something weird');
  const out = await classifyIntentSLM('q', draft, { hasUserLoc: false });
  assert.equal(out.intentType, 'discovery');
  const out2 = await classifyIntentSLM('q', draft, { hasUserLoc: true });
  assert.equal(out2.intentType, 'nearby');
  setPipelineForTests(null);
});
