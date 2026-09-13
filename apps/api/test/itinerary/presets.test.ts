import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITINERARY_PRESETS, COURSE_ORDER, TIME_SLOTS } from '../../src/itinerary/presets.ts';
import { VIBE_VOCAB } from '../../src/enrich/vibeVocab.ts';
import { timeOfDay } from '@vegan-bangkok/schemas';

test('presets are non-empty, each complete, ids unique', () => {
  assert.ok(ITINERARY_PRESETS.length >= 5);
  for (const p of ITINERARY_PRESETS) {
    assert.ok(p.id && p.label && p.icon, `${p.id}: label/icon missing`);
    assert.ok(p.courseShape.length >= 1, `${p.id}: empty courseShape`);
    assert.ok(typeof p.defaults === 'object', `${p.id}: defaults missing`);
  }
  assert.equal(new Set(ITINERARY_PRESETS.map((p) => p.id)).size, ITINERARY_PRESETS.length);
});

test('every preset vibe tag is in VIBE_VOCAB', () => {
  const vocab = new Set<string>(VIBE_VOCAB);
  for (const p of ITINERARY_PRESETS) {
    for (const v of p.vibeTags) assert.ok(vocab.has(v), `${p.id}: '${v}' not in VIBE_VOCAB`);
  }
});

test('COURSE_ORDER and TIME_SLOTS are the canonical ordered slots', () => {
  assert.deepEqual([...COURSE_ORDER], ['starter', 'main', 'dessert']);
  assert.deepEqual([...TIME_SLOTS], ['daytime', 'sunset', 'evening']);
});

test('TIME_SLOTS matches the shared timeOfDay schema enum', () => {
  assert.deepEqual([...TIME_SLOTS], timeOfDay.options);
});
