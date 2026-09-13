// Zero-shot intent classifier (slice 2, spec 2026-07-27-place-search-slm-design).
// Lazy singleton around Transformers.js — the model loads on the first low-confidence
// query and stays resident. English-only model by decision; Thai queries answer via
// the deterministic path. The classifier can ONLY produce intentType + mode.
import type { PlaceIntentType } from '@vegan-bangkok/schemas';

export type ZeroShotFn = (
  text: string, labels: string[], opts: { hypothesis_template: string },
) => Promise<{ labels: string[]; scores: number[] }>;

export class SlmNotReadyError extends Error {}
export class SlmError extends Error {}

const MODEL = 'Xenova/nli-deberta-v3-xsmall';
const HYPOTHESIS = 'This restaurant search query is about {}.';

// label → (intentType, mode). Mode labels imply discovery (spec: single call, top label wins).
const LABELS: Record<string, { intentType: PlaceIntentType; mode: 'popular' | 'hidden_gems' | null }> = {
  'looking for a specific named restaurant or dish':         { intentType: 'entity',    mode: null },
  'a relaxed casual place to eat, no particular criteria':   { intentType: 'discovery', mode: null },
  'planning a multi-stop food tour or itinerary':            { intentType: 'planning',  mode: null },
  'top rated or highly rated restaurants':                   { intentType: 'best',      mode: null },
  'places within walking distance of my current gps location': { intentType: 'nearby',    mode: null },
  'famous popular restaurants that many people visit':       { intentType: 'discovery', mode: 'popular' },
  'secret hidden gems that few tourists know about':         { intentType: 'discovery', mode: 'hidden_gems' },
};

let override: ZeroShotFn | null = null;
let real: ZeroShotFn | null = null;
let loading: Promise<void> | null = null;
let loadError: Error | null = null;

export function setPipelineForTests(fake: ZeroShotFn | null): void {
  override = fake;
  if (fake === null) { real = null; loading = null; loadError = null; }
}

function startLoad(): void {
  loading ??= import('@huggingface/transformers')
    .then(async ({ pipeline }) => {
      const p = await pipeline('zero-shot-classification', MODEL);
      real = ((text, labels, opts) => p(text, labels, opts)) as ZeroShotFn;
    })
    .catch((err) => { loadError = err instanceof Error ? err : new Error(String(err)); loading = null; });
}

export async function classifyIntent(
  q: string,
): Promise<{ intentType: PlaceIntentType; mode: 'popular' | 'hidden_gems' | null }> {
  const fn = override ?? real;
  if (!fn) {
    if (loadError) { const e = loadError; loadError = null; throw new SlmError(e.message); }
    // never start a background model download inside `npm test` (NODE_ENV=test via .env.test);
    // SLM_TEST=1 (the gated integration test) explicitly opts back in.
    if (process.env.NODE_ENV !== 'test' || process.env.SLM_TEST === '1') startLoad();
    throw new SlmNotReadyError('model loading');
  }
  let result;
  try {
    result = await fn(q, Object.keys(LABELS), { hypothesis_template: HYPOTHESIS });
  } catch (err) {
    throw new SlmError(err instanceof Error ? err.message : String(err));
  }
  const top = result.labels[0];
  const mapped = top != null ? LABELS[top] : undefined;
  if (!mapped) throw new SlmError(`unknown label: ${top}`);
  return mapped;
}
