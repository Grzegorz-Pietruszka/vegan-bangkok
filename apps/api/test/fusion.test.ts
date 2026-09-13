import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rrfFuse } from '../src/search/fusion.ts';

test('item in multiple arms outranks single-arm items', () => {
  const fused = rrfFuse([
    [{ id: 'a', score: 0.9 }, { id: 'b', score: 0.8 }],
    [{ id: 'b', score: 0.7 }, { id: 'c', score: 0.6 }],
  ]);
  assert.equal(fused[0].id, 'b');
  assert.equal(fused.length, 3);
});

test('rrf math: rank 1 in one arm = 1/(60+1)', () => {
  const fused = rrfFuse([[{ id: 'a', score: 1 }]]);
  assert.ok(Math.abs(fused[0].score - 1 / 61) < 1e-12);
});

test('empty input', () => {
  assert.deepEqual(rrfFuse([]), []);
  assert.deepEqual(rrfFuse([[], []]), []);
});
