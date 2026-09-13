import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName } from '../src/search/normalize.ts';
import { findIngredientFlags, type IngredientDictEntry } from '../src/ocr/ingredientMatch.ts';

// Pure matcher — dict shaped like ingredient_aliases ⋈ ingredients rows. Entries are built
// through the ONE normalizer, same as the seed writes them.
function entry(nameEn: string, alias: string, id = nameEn): IngredientDictEntry {
  return {
    ingredientId: id, nameEn, nameTh: null, veganRiskClass: 'hard_block',
    aliasText: alias, aliasNormalized: normalizeName(alias),
  };
}

const DICT: IngredientDictEntry[] = [
  entry('Pork', 'หมู'),
  entry('Oyster sauce', 'น้ำมันหอย'),
  entry('Egg', 'ไข่'),
  entry('Milk', 'นม'),
  entry('Milk', 'milk'),      // second alias of the same ingredient
  entry('Fish sauce', 'น้ำปลา'),
  entry('Fish', 'ปลา'),       // ⊂ น้ำปลา — span consumption keeps these apart
  entry('Shellfish', 'หอย'),  // ⊂ น้ำมันหอย
];

test('hard-block ingredient detected on a line that matches NO dish (the load-bearing case)', () => {
  // ผัดผักกาดขาวน้ำมันหอย — stir-fried cabbage in oyster sauce; not a catalogued dish
  const flags = findIngredientFlags(normalizeName('ผัดผักกาดขาวน้ำมันหอย 80.-'), DICT);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].nameEn, 'Oyster sauce');
  assert.equal(flags[0].veganRiskClass, 'hard_block');
  assert.equal(flags[0].matchedAlias, 'น้ำมันหอย');
});

test('a line with no ingredient terms returns no flags', () => {
  assert.deepEqual(findIngredientFlags(normalizeName('ผัดผักรวมมิตร'), DICT), []);
});

test('matching goes through normalizeName — raw spacing/punctuation cannot hide a term', () => {
  // "น้ำ ปลา" with a space still normalizes to a string containing น้ำปลา
  const flags = findIngredientFlags(normalizeName('ยำรวม (น้ำ ปลา) 60.-'), DICT);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].nameEn, 'Fish sauce');
});

test('multiple distinct ingredient hits on one line all surface', () => {
  const flags = findIngredientFlags(normalizeName('ผัดผักบุ้งน้ำมันหอยใส่ไข่'), DICT);
  assert.deepEqual(flags.map((f) => f.nameEn).sort(), ['Egg', 'Oyster sauce']);
});

test('nested aliases: the longer, more specific term wins its span (น้ำมันหอย ⊅ หอย flag)', () => {
  const flags = findIngredientFlags(normalizeName('ผัดผักกาดขาวน้ำมันหอย'), DICT);
  assert.deepEqual(flags.map((f) => f.nameEn), ['Oyster sauce'],
    'หอย inside น้ำมันหอย must not double-flag as Shellfish');
});

test('nested aliases: the short term still flags where it occurs independently', () => {
  // น้ำปลา consumed → Fish sauce; the second, standalone ปลา still flags Fish
  const flags = findIngredientFlags(normalizeName('น้ำปลา และ ปลาทอด'), DICT);
  assert.deepEqual(flags.map((f) => f.nameEn).sort(), ['Fish', 'Fish sauce']);
});

test('two aliases of the SAME ingredient dedupe to one flag', () => {
  const flags = findIngredientFlags(normalizeName('นมสด fresh milk'), DICT);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].nameEn, 'Milk');
});

test('mock-meat words on a jay menu ARE flagged here — the pipeline (not this matcher) decides precedence', () => {
  // กะเพราหมูกรอบ on a jay menu is mock pork; the raw matcher must still report หมู so the
  // pipeline can surface (not silently drop) it next to a dish match.
  const flags = findIngredientFlags(normalizeName('กะเพราหมูกรอบ 80.-'), DICT);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].nameEn, 'Pork');
});
