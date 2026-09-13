import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeDishInput } from '../src/embed/compose.ts';

test('composeDishInput groups tags by facet as labeled lines', () => {
  const out = composeDishInput({
    nameEn: 'Tom Yum', regionName: 'Central', description: 'hot and sour soup',
    spiceLevel: 4,
    tags: [
      { facet: 'flavor', nameEn: 'sour' }, { facet: 'flavor', nameEn: 'spicy' },
      { facet: 'cooking_method', nameEn: 'boiled' }, { facet: 'form', nameEn: 'soup' },
      { facet: 'course', nameEn: 'main' },
    ],
  });
  assert.match(out, /flavors: sour, spicy/);
  assert.match(out, /method: boiled/);
  assert.match(out, /form: soup/);
  assert.match(out, /course: main/);
  assert.match(out, /^Tom Yum/);
});

test('composeDishInput omits the tag block when there are no tags', () => {
  const out = composeDishInput({ nameEn: 'Plain', tags: [] });
  assert.equal(out, 'Plain');
});
