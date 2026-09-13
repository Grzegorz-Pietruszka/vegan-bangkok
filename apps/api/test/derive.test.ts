import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivePlace, type GenerateFn } from '../src/enrich/derive.ts';
import { MODEL } from '../src/embed/gemini.ts';
import type { CanonicalPlace } from '../src/enrich/adapters/types.ts';

const merged = (over: Partial<CanonicalPlace> = {}): CanonicalPlace => ({
  googlePlaceId: 'ChIJx', source: 'google_places', name: 'Fixture Vegan Kitchen',
  lat: 13.7, lng: 100.5, hours: null, priceBand: 1, fetchedAt: new Date(),
  _editorialSummary: 'Casual tofu-curry shophouse.',
  _reviewTexts: ['Khao soi fully vegan.', 'Quiet mornings.'],
  ...over,
});

// deps factory: spying generate + embed that record calls
function deps(gen: Awaited<ReturnType<GenerateFn>>) {
  const generateCalls: any[] = [];
  const embedCalls: any[] = [];
  return {
    generateCalls, embedCalls,
    generate: (async (req: any) => { generateCalls.push(req); return gen; }) as GenerateFn,
    embed: async (texts: string[], taskType: string) => {
      embedCalls.push({ texts, taskType });
      return texts.map(() => [0.6, 0.8]); // pre-normalized fake vector, returned as-is
    },
  };
}

test('hallucination guard: off-vocab tags dropped, cap 5', async () => {
  const d = deps({ summary: 'A quiet shophouse spot.', vibeTags: ['historic', 'made-up-vibe'] });
  const out = await derivePlace(merged(), d);
  assert.deepEqual(out.vibeTags, ['historic']);

  const many = deps({ summary: 's', vibeTags: ['historic', 'vintage', 'quiet', 'bustling', 'artsy', 'rooftop', 'garden'] });
  const capped = await derivePlace(merged(), many);
  assert.equal(capped.vibeTags.length, 5);
});

test('summary passthrough + grounded closed-context prompt shape', async () => {
  const d = deps({ summary: 'A quiet shophouse spot.', vibeTags: ['quiet'] });
  const out = await derivePlace(merged(), d);
  assert.equal(out.summary, 'A quiet shophouse spot.');
  assert.equal(out.deriveComplete, true);

  assert.equal(d.generateCalls.length, 1);
  const req = d.generateCalls[0];
  assert.match(req.systemInstruction, /ONLY the source text/i); // closed-context grounding
  assert.match(req.systemInstruction, /monsoon-comfort/);       // vocab pinned in the prompt
  assert.match(req.input, /Fixture Vegan Kitchen/);
  assert.match(req.input, /Casual tofu-curry shophouse\./);
  assert.match(req.input, /Khao soi fully vegan\./);
});

test('empty derive input: generate NOT called, embedding still produced from name/facts', async () => {
  const d = deps({ summary: 'never', vibeTags: ['quiet'] });
  const out = await derivePlace(merged({ _editorialSummary: null, _reviewTexts: [] }), d);
  assert.equal(d.generateCalls.length, 0);
  assert.equal(out.summary, null);
  assert.deepEqual(out.vibeTags, []);
  assert.equal(out.deriveComplete, true);
  assert.deepEqual(out.embedding, [0.6, 0.8]);
  assert.match(d.embedCalls[0].texts[0], /Fixture Vegan Kitchen/); // composed from facts
});

test('embedding: RETRIEVAL_DOCUMENT task type, embed pipeline output used verbatim, model recorded', async () => {
  const d = deps({ summary: 'A quiet spot.', vibeTags: ['quiet'] });
  const out = await derivePlace(merged(), d);
  assert.equal(d.embedCalls[0].taskType, 'RETRIEVAL_DOCUMENT');
  assert.deepEqual(out.embedding, [0.6, 0.8]); // L2-normalization lives in the shared gemini embed
  assert.equal(out.embeddingModel, MODEL);
  assert.match(out.embeddingInput, /A quiet spot\./);  // summary + tags feed the place document
  assert.match(out.embeddingInput, /quiet/);
  assert.equal(d.embedCalls[0].texts[0], out.embeddingInput);
});

test('generate/embed failure propagates (caller leaves enrichedAt null)', async () => {
  const boomGen = { ...deps({ summary: 's', vibeTags: [] }), generate: async () => { throw new Error('quota'); } };
  await assert.rejects(() => derivePlace(merged(), boomGen), /quota/);
  const boomEmbed = { ...deps({ summary: 's', vibeTags: [] }), embed: async () => { throw new Error('embed down'); } };
  await assert.rejects(() => derivePlace(merged(), boomEmbed), /embed down/);
});
