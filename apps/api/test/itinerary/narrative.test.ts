import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RouteStep } from '@vegan-bangkok/schemas';
import { narrate, templateNarrative } from '../../src/itinerary/narrative.ts';

const steps: RouteStep[] = [
  { type: 'site', id: crypto.randomUUID(), name: 'Wat Pho', nameTh: 'วัดโพธิ์', lat: 13.7466, lng: 100.493, order: 0, summary: 'Reclining Buddha temple' },
  { type: 'place', id: crypto.randomUUID(), name: 'Jae Oa Vegetarian', nameTh: null, lat: 13.7405, lng: 100.5095, order: 1, summary: 'Jay stalwart', walkMetersFromPrev: 1900 },
];

test('prompt is closed-context: forbids invention, carries only supplied stop facts', async () => {
  let captured: { systemInstruction: string; input: string } | null = null;
  const generate = async (req: { systemInstruction: string; input: string }) => {
    captured = req; return 'A lovely stroll.';
  };
  const r = await narrate(steps, { presetLabel: 'Temples + lunch' }, { generate });
  assert.equal(r.text, 'A lovely stroll.');
  assert.equal(r.degraded, false);
  assert.match(captured!.systemInstruction, /ONLY the stop facts/);
  assert.match(captured!.systemInstruction, /never invent/i);
  for (const s of steps) {
    assert.ok(captured!.input.includes(s.name), `prompt missing stop ${s.name}`);
  }
  assert.ok(captured!.input.includes('Temples + lunch'), 'prompt missing intent');
});

test('generator throws → deterministic template, degraded=true, order preserved', async () => {
  const boom = async () => { throw new Error('gemini down'); };
  const r = await narrate(steps, { text: 'temples' }, { generate: boom });
  assert.equal(r.degraded, true);
  const iPho = r.text.indexOf('Wat Pho');
  const iJae = r.text.indexOf('Jae Oa Vegetarian');
  assert.ok(iPho !== -1 && iJae !== -1 && iPho < iJae, `template broken: ${r.text}`);
});

test('empty generator output falls back to template', async () => {
  const empty = async () => '   ';
  const r = await narrate(steps, {}, { generate: empty });
  assert.ok(r.text.includes('Wat Pho'));
  assert.equal(r.degraded, true);
});

test('template mentions walking distance when present', () => {
  const t = templateNarrative(steps);
  assert.match(t, /1\.9\s?km|1900\s?m/);
});
