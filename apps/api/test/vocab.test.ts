import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIBE_VOCAB, isVibeTag } from '../src/enrich/vibeVocab.ts';
import { VENUE_TYPES, isVenueType } from '../src/enrich/venueTypes.ts';

test('VIBE_VOCAB is a non-empty readonly tuple of unique tags', () => {
  assert.ok(Array.isArray(VIBE_VOCAB) && VIBE_VOCAB.length >= 20);
  assert.equal(new Set(VIBE_VOCAB).size, VIBE_VOCAB.length);
});

test('isVibeTag accepts vocab entries and rejects everything else', () => {
  assert.equal(isVibeTag('historic'), true);
  assert.equal(isVibeTag('cozy-ish'), false);
  assert.equal(isVibeTag(''), false);
});

test('every vibe tag hand-authored in seed/data.json is in the vocab', () => {
  // The seed places carry curated vibeTags; the write layer re-validates against
  // VIBE_VOCAB, so a seed tag outside the vocab would make seeding unenrichable.
  const data = JSON.parse(readFileSync(new URL('../seed/data.json', import.meta.url), 'utf8'));
  for (const p of data.places) {
    for (const tag of p.vibeTags ?? []) {
      assert.ok(isVibeTag(tag), `seed tag "${tag}" (${p.name}) missing from VIBE_VOCAB`);
    }
  }
});

test('VENUE_TYPES defined and isVenueType works', () => {
  assert.ok(VENUE_TYPES.length >= 5);
  assert.equal(isVenueType('street_stall'), true);
  assert.equal(isVenueType('spaceship'), false);
});

test('no TS enum in the enrich modules (as const unions only)', () => {
  for (const f of ['vibeVocab.ts', 'venueTypes.ts']) {
    const src = readFileSync(new URL(`../src/enrich/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\benum\b/, `${f} must use as const unions, not enum`);
  }
});
