import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankUnknownTerms } from './terms.ts';
import { normalizeName } from '../../../api/src/search/normalize.ts';

const id = (s: string) => s.trim();

test('drops known tokens, ranks the rest by frequency', () => {
  const known = new Set(['กะเพรา', 'ข้าวผัด']);
  const lines = [
    ['ผัด', 'กะเพรา', 'เห็ด'],
    ['ข้าวผัด', 'เห็ด'],
    ['เห็ด'],
    ['ผัด'],
  ];
  const out = rankUnknownTerms(lines, known, id);
  assert.deepEqual(out, [
    { term: 'เห็ด', freq: 3 },
    { term: 'ผัด', freq: 2 },
  ]);
});

test('single-character and empty tokens are ignored', () => {
  const out = rankUnknownTerms([['ก', '', 'เห็ด']], new Set(), id);
  assert.deepEqual(out, [{ term: 'เห็ด', freq: 1 }]);
});

// Regression (final review, Finding 1): the approve→known-set contract. Approving a term as
// an ingredient writes ingredient_aliases.alias_normalized = normalizeName(term), and
// knownTerms() unions that column into the known set — so on the next run the term must be
// excluded. Encodes the fix for the bug where the ingredient path wrote no alias row and the
// approved term reappeared as unknown.
test('term approved as ingredient (alias row) is known on the next mining run', () => {
  const term = 'เห็ด-ทอด'; // display form with a dash — normalization must line up on both sides
  const knownFromIngredientAliases = new Set([normalizeName(term)]); // what approveTerm persists
  const out = rankUnknownTerms([[term, 'ผัดซีอิ๊ว'], [term]], knownFromIngredientAliases, normalizeName);
  assert.deepEqual(out, [{ term: normalizeName('ผัดซีอิ๊ว'), freq: 1 }]);
});
