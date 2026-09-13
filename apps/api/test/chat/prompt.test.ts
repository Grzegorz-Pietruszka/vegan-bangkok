import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatPrompt } from '../../src/chat/prompt.ts';

const CANDS = [
  { nameEn: 'Khao soi', nameTh: 'ข้าวซอย', description: 'Coconut curry noodles',
    spiceLevel: 2, tags: ['noodles', 'curry'], placeName: 'Jae Oa', distanceM: 850 },
  { nameEn: 'Som tam', nameTh: null, description: null,
    spiceLevel: 4, tags: [], placeName: null, distanceM: null },
];

test('system prompt forbids invention and demands brevity', () => {
  const { system } = buildChatPrompt('not spicy', CANDS);
  assert.match(system, /ONLY the dishes listed/);
  assert.match(system, /never invent/i);
  assert.match(system, /2.4 sentences|2–4 sentences/);
});

test('user prompt carries every candidate fact and the raw craving', () => {
  const { user } = buildChatPrompt('something warming, not spicy', CANDS);
  assert.ok(user.includes('something warming, not spicy'));
  assert.ok(user.includes('Khao soi'));
  assert.ok(user.includes('ข้าวซอย'));
  assert.ok(user.includes('spice 2/5'));
  assert.ok(user.includes('Jae Oa'));
  assert.ok(user.includes('850 m'));
  assert.ok(user.includes('Som tam'));
  // absent facts don't render placeholder noise
  assert.ok(!user.includes('null'));
});
