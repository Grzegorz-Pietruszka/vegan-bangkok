import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedWith } from '../src/embed/gemini.ts';

test('embedWith maps each input to a vector and tags task type', async () => {
  const calls: any[] = [];
  const fakeClient = { models: { embedContent: async (req: any) => {
    calls.push(req);
    return { embeddings: req.contents.map(() => ({ values: new Array(1536).fill(0.01) })) };
  } } };
  const out = await embedWith(fakeClient as any, ['a', 'b'], 'RETRIEVAL_QUERY');
  assert.equal(out.length, 2);
  assert.equal(out[0].length, 1536);
  assert.equal(calls[0].config.taskType, 'RETRIEVAL_QUERY');
});
