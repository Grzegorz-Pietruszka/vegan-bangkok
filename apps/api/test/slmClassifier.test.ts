import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyIntent, setPipelineForTests, SlmNotReadyError, SlmError, type ZeroShotFn,
} from '../src/search/slmClassifier.ts';

beforeEach(() => setPipelineForTests(null));

// fake that always ranks the given label first
const fakeTop = (topLabel: string): ZeroShotFn => async (_t, labels) => ({
  labels: [topLabel, ...labels.filter((l) => l !== topLabel)],
  scores: labels.map((_, i) => (i === 0 ? 0.9 : 0.01)),
});

test('intent labels map to intent types, mode null', async () => {
  setPipelineForTests(fakeTop('planning a multi-stop food tour or itinerary'));
  assert.deepEqual(await classifyIntent('x'), { intentType: 'planning', mode: null });
  setPipelineForTests(fakeTop('places within walking distance of my current gps location'));
  assert.deepEqual(await classifyIntent('x'), { intentType: 'nearby', mode: null });
});

test('mode labels imply discovery + mode', async () => {
  setPipelineForTests(fakeTop('secret hidden gems that few tourists know about'));
  assert.deepEqual(await classifyIntent('x'), { intentType: 'discovery', mode: 'hidden_gems' });
  setPipelineForTests(fakeTop('famous popular restaurants that many people visit'));
  assert.deepEqual(await classifyIntent('x'), { intentType: 'discovery', mode: 'popular' });
});

test('pipeline failure → SlmError', async () => {
  setPipelineForTests(async () => { throw new Error('onnx exploded'); });
  await assert.rejects(classifyIntent('x'), SlmError);
});

test('not ready → SlmNotReadyError immediately, no download in tests', async () => {
  setPipelineForTests(null);
  // NODE_ENV=test (from .env.test) means classifyIntent must throw SlmNotReadyError
  // WITHOUT starting the background model load — npm test never downloads the model.
  await assert.rejects(classifyIntent('x'), SlmNotReadyError);
});
