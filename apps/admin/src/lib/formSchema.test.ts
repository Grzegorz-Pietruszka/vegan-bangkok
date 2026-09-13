import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceFormData } from './formSchema.ts';
import type { FieldDescriptor } from '@vegan-bangkok/db';

const f = (p: Partial<FieldDescriptor>): FieldDescriptor =>
  ({ name: 'x', column: 'x', widget: 'text', required: false, readOnly: false, array: false, ...p });

test('numbers coerce, empty → null', () => {
  const fields = [f({ name: 'priceBand', widget: 'number' })];
  const fd = new FormData(); fd.set('priceBand', '3');
  assert.equal(coerceFormData(fields, fd).priceBand, 3);
  const fd2 = new FormData(); fd2.set('priceBand', '');
  assert.equal(coerceFormData(fields, fd2).priceBand, null);
});

test('booleans from checkbox presence', () => {
  const fields = [f({ name: 'verifiedVegan', widget: 'boolean' })];
  const on = new FormData(); on.set('verifiedVegan', 'on');
  assert.equal(coerceFormData(fields, on).verifiedVegan, true);
  assert.equal(coerceFormData(fields, new FormData()).verifiedVegan, false);
});

test('text arrays split on comma and trim', () => {
  const fields = [f({ name: 'vibeTags', widget: 'text', array: true })];
  const fd = new FormData(); fd.set('vibeTags', 'cozy,  quiet , date-night');
  assert.deepEqual(coerceFormData(fields, fd).vibeTags, ['cozy', 'quiet', 'date-night']);
});

test('date widget coerces to Date preserving the instant', () => {
  const fields = [f({ name: 'embeddedAt', widget: 'date' })];
  const fd = new FormData(); fd.set('embeddedAt', '2026-07-05 08:57:28.343+00');
  const out = coerceFormData(fields, fd).embeddedAt;
  assert.ok(out instanceof Date);
  assert.equal((out as Date).toISOString(), '2026-07-05T08:57:28.343Z');
});

test('json parses; readOnly fields are skipped', () => {
  const fields = [f({ name: 'hours', widget: 'json' }), f({ name: 'id', widget: 'text', readOnly: true })];
  const fd = new FormData(); fd.set('hours', '{"mon":"9-5"}'); fd.set('id', 'nope');
  const out = coerceFormData(fields, fd);
  assert.deepEqual(out.hours, { mon: '9-5' });
  assert.ok(!('id' in out));
});
