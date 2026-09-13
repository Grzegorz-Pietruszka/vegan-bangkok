import { GoogleGenAI } from '@google/genai';
import type { RouteStep } from '@vegan-bangkok/schemas';
import { GENERATE_MODEL } from '../enrich/derive.ts';

export type NarrateFn = (req: { systemInstruction: string; input: string }) => Promise<string>;

// Closed-context grounding, same discipline as the enrichment derive step: the model
// may only phrase the facts handed to it — the route data itself comes from the DB.
const SYSTEM_INSTRUCTION = [
  'You write a short, warm walking-route intro for a curated vegan Bangkok guide.',
  'Use ONLY the stop facts provided below — never invent names, dishes, prices, or history.',
  'Mention the stops in the given walking order. 3–5 sentences, plain prose, no lists, no markdown.',
].join('\n');

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

// Deterministic fallback — the route must always be describable with Gemini down.
export function templateNarrative(steps: RouteStep[]): string {
  if (steps.length === 0) return '';
  const legs = steps.map((s, i) => {
    const walk = s.walkMetersFromPrev != null && i > 0 ? ` (${km(s.walkMetersFromPrev)} walk)` : '';
    return `${s.name}${walk}`;
  });
  const last = legs.pop();
  const body = legs.length ? `${legs.join(', then ')}, and finish at ${last}` : `${last}`;
  return `A ${steps.length}-stop walk: start at ${body}.`;
}

export async function narrate(
  steps: RouteStep[],
  intent: { text?: string; presetLabel?: string },
  deps: { generate?: NarrateFn } = {},
): Promise<{ text: string; degraded: boolean }> {
  if (steps.length === 0) return { text: '', degraded: false };
  const generate = deps.generate ?? generateWithGemini;
  const input = [
    intent.presetLabel ? `Vibe: ${intent.presetLabel}` : null,
    intent.text ? `Asked for: ${intent.text}` : null,
    'Stops in walking order:',
    ...steps.map((s, i) => {
      const walk = s.walkMetersFromPrev != null && i > 0 ? ` — ${km(s.walkMetersFromPrev)} walk from previous` : '';
      return `${i + 1}. ${s.name}${s.nameTh ? ` (${s.nameTh})` : ''}: ${s.summary ?? 'no notes'}${walk}`;
    }),
  ].filter(Boolean).join('\n');

  try {
    const text = (await generate({ systemInstruction: SYSTEM_INSTRUCTION, input })).trim();
    if (!text) return { text: templateNarrative(steps), degraded: true };
    return { text, degraded: false };
  } catch {
    return { text: templateNarrative(steps), degraded: true };
  }
}

let client: GoogleGenAI | null = null;
const generateWithGemini: NarrateFn = async (req) => {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await client.models.generateContent({
    model: GENERATE_MODEL,
    contents: req.input,
    config: { systemInstruction: req.systemInstruction },
  });
  return res.text ?? '';
};
