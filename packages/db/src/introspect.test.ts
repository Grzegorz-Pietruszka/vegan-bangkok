import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeTable, tableRegistry } from './introspect.ts';

test('registry exposes all thirteen tables', () => {
  assert.deepEqual(
    Object.keys(tableRegistry).sort(),
    ['dishAliases','dishIngredients','dishTags','dishes','ingredientAliases','ingredientTags',
     'ingredients','menuScanMisses','placeDishes','places','queryEmbeddingCache','regions','tags'].sort(),
  );
});

test('tags.facet is an enum with the five facets', () => {
  const f = describeTable('tags').find((x) => x.name === 'facet')!;
  assert.equal(f.widget, 'enum');
  assert.deepEqual(f.enumValues, ['flavor','cooking_method','form','ingredient_type','course']);
});

test('dishTags fk columns resolve to their tables', () => {
  const f = describeTable('dishTags');
  assert.equal(f.find((x) => x.name === 'dishId')!.fkTable, 'dishes');
  assert.equal(f.find((x) => x.name === 'tagId')!.fkTable, 'tags');
});

test('places: enum, fk, vector, json, array columns are classified', () => {
  const f = describeTable('places');
  const by = (n: string) => f.find((x) => x.name === n)!;
  assert.equal(by('veganStatus').widget, 'enum');
  assert.deepEqual(by('veganStatus').enumValues, ['fully_vegan','vegetarian_jay','vegan_friendly']);
  assert.equal(by('vibeTags').array, true);
  assert.equal(by('vibeTags').widget, 'text');
  assert.equal(by('hours').widget, 'json');
  assert.equal(by('embedding').widget, 'hidden');
  assert.equal(by('embedding').readOnly, true);
  assert.equal(by('name').required, true);
});

test('dishes.regionId is an fk to regions', () => {
  const f = describeTable('dishes').find((x) => x.name === 'regionId')!;
  assert.equal(f.widget, 'fk');
  assert.equal(f.fkTable, 'regions');
});

test('id/createdAt/updatedAt are readOnly', () => {
  const f = describeTable('regions');
  for (const n of ['id','createdAt','updatedAt']) {
    assert.equal(f.find((x) => x.name === n)!.readOnly, true, n);
  }
});

test('pipeline-managed columns are readOnly', () => {
  const places = describeTable('places');
  for (const n of ['embeddingInput','embeddingModel','embeddedAt','fetchedAt','enrichedAt']) {
    assert.equal(places.find((x) => x.name === n)!.readOnly, true, `places.${n}`);
  }
  const dishes = describeTable('dishes');
  for (const n of ['embeddingInput','embeddingModel','embeddedAt']) {
    assert.equal(dishes.find((x) => x.name === n)!.readOnly, true, `dishes.${n}`);
  }
  // Hand-editable columns stay writable.
  assert.equal(places.find((x) => x.name === 'summary')!.readOnly, false);
  assert.equal(places.find((x) => x.name === 'name')!.readOnly, false);
});

test('long text columns carry the long flag, others do not', () => {
  const by = (t: string, n: string) => describeTable(t).find((x) => x.name === n)!;
  assert.equal(by('places', 'summary').long, true);
  assert.equal(by('places', 'summary').widget, 'text');
  assert.equal(by('dishes', 'description').long, true);
  assert.equal(by('places', 'name').long, undefined);
});
