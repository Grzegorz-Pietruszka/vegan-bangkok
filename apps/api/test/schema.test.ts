import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dishes, places, placeDishes } from '../src/db/schema.ts';

test('dishes has an embedding vector column', () => {
  assert.ok('embedding' in dishes);
  assert.ok('embeddingModel' in dishes);
});
test('placeDishes carries the trust columns', () => {
  for (const c of ['verifiedVegan', 'source', 'confidence', 'lovedCount']) assert.ok(c in placeDishes);
});
test('places has jsonb hours + vegan status', () => {
  for (const c of ['hours', 'veganStatus']) assert.ok(c in places);
});
