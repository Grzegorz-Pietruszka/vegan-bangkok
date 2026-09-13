import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTable, cellValue, rowLabel, TABLE_KEYS } from './tables.ts';

test('allowlist matches the thirteen known tables', () => {
  assert.equal(TABLE_KEYS.length, 13);
  assert.ok(TABLE_KEYS.includes('places'));
});

test('assertTable rejects unknown tables', () => {
  assert.throws(() => assertTable('users; drop table places'));
});

test('rowLabel uses the configured label column', () => {
  assert.equal(rowLabel('places', { name: 'Broccoli', id: 'x' }), 'Broccoli');
  assert.equal(rowLabel('dishes', { nameEn: 'Pad Thai', id: 'x' }), 'Pad Thai');
});

// Regression (final review, Finding 3): raw `SELECT *` rows carry snake_case keys, and the
// list/label lookups previously read only the camelCase field name → blank cells/labels.
test('rowLabel resolves snake_case row keys from raw SQL', () => {
  assert.equal(rowLabel('dishes', { name_en: 'Pad Thai', id: 'x' }), 'Pad Thai');
  assert.equal(rowLabel('menuScanMisses', { raw_text: 'เต้าหู้ทอด', id: 'x' }), 'เต้าหู้ทอด');
  assert.equal(rowLabel('dishes', { id: 'fallback-id' }), 'fallback-id');
});

test('cellValue reads the camelCase key with a snake_case fallback', () => {
  const f = { name: 'nameEn', column: 'name_en' };
  assert.equal(cellValue({ nameEn: 'Pad Thai' }, f), 'Pad Thai');
  assert.equal(cellValue({ name_en: 'Pad Thai' }, f), 'Pad Thai');
  assert.equal(cellValue({}, f), undefined);
});
