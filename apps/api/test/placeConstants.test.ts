import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICTS, matchDistrict, INTENT_PATTERNS, RANK_WEIGHTS } from '../src/search/constants.ts';
import { normalizeName } from '../src/search/normalize.ts';

test('every seed neighbourhood has a district entry', async () => {
  // canonical values must cover what places.neighbourhood actually contains
  const { readFile } = await import('node:fs/promises');
  const data = JSON.parse(await readFile(new URL('../seed/data.json', import.meta.url), 'utf8'));
  const hoods = new Set<string>(data.places.map((p: any) => p.neighbourhood).filter(Boolean));
  for (const h of hoods) {
    assert.ok(DISTRICTS.some(d => d.canonical === h), `missing district for neighbourhood "${h}"`);
  }
});

test('aliases resolve through normalizeName, Thai included', () => {
  assert.equal(matchDistrict(normalizeName('Thong Lo'))?.canonical, 'Thonglor');
  assert.equal(matchDistrict(normalizeName('ทองหล่อ'))?.canonical, 'Thonglor');
  assert.equal(matchDistrict(normalizeName('yaowarat'))?.canonical, 'Chinatown');
  assert.equal(matchDistrict(normalizeName('nowhere-land')), null);
});

test('patterns: hidden gems and near me', () => {
  assert.ok(INTENT_PATTERNS.hiddenGems.test('some hidden gem cafe'));
  assert.ok(INTENT_PATTERNS.nearby.test('vegan food near me'));
});

test('weights: hidden_gems popularity is negative, all intents present', () => {
  assert.ok(RANK_WEIGHTS.hidden_gems.popularity < 0);
  for (const k of ['entity', 'nearby', 'best', 'discovery', 'hidden_gems', 'planning'] as const) {
    assert.ok(RANK_WEIGHTS[k]);
  }
});
