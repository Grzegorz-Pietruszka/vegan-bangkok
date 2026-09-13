import { GoogleGenAI, Type } from '@google/genai';
import type { CanonicalPlace } from './adapters/types.ts';
import { VIBE_VOCAB, isVibeTag, type VibeTag } from './vibeVocab.ts';
import { composePlaceInput } from '../embed/compose.ts';
import { embed, MODEL, type TaskType } from '../embed/gemini.ts';

export const GENERATE_MODEL = 'gemini-2.5-flash';
const MAX_TAGS = 5;

export type GenerateRequest = { systemInstruction: string; input: string };
export type GenerateFn = (req: GenerateRequest) => Promise<{ summary?: string; vibeTags?: string[] }>;
export type EmbedFn = (texts: string[], taskType: TaskType) => Promise<number[][]>;

export type DerivedPlace = {
  summary: string | null;
  vibeTags: VibeTag[];
  embeddingInput: string;
  embedding: number[];
  embeddingModel: string;
  deriveComplete: true;
};

// Closed-context grounding: the model may only restate what the transient source text
// says (derive-and-drop — the source text itself is never persisted).
const SYSTEM_INSTRUCTION = [
  'You summarize places for a curated vegan Bangkok guide.',
  'Write one grounded sentence using ONLY the source text provided — never add facts, names, or claims that are not in it.',
  `Then pick up to ${MAX_TAGS} vibeTags, strictly from this vocabulary: ${VIBE_VOCAB.join(', ')}.`,
].join('\n');

export async function derivePlace(
  merged: CanonicalPlace,
  deps: { generate?: GenerateFn; embed?: EmbedFn } = {},
): Promise<DerivedPlace> {
  const generate = deps.generate ?? generateWithGemini;
  const embedFn = deps.embed ?? embed;

  const sources = [merged._editorialSummary, ...(merged._reviewTexts ?? [])].filter(Boolean);
  let summary: string | null = null;
  let vibeTags: VibeTag[] = [];
  if (sources.length > 0) {
    const input = [`Place: ${merged.name ?? merged.googlePlaceId}`, 'Source text:', ...sources].join('\n');
    const out = await generate({ systemInstruction: SYSTEM_INSTRUCTION, input });
    summary = out.summary?.trim() || null;
    // hallucination guard — off-vocab tags are dropped, never persisted
    vibeTags = (out.vibeTags ?? []).filter(isVibeTag).slice(0, MAX_TAGS);
  }

  const embeddingInput = composePlaceInput({ name: merged.name, summary, vibeTags });
  const [embedding] = await embedFn([embeddingInput], 'RETRIEVAL_DOCUMENT');
  return { summary, vibeTags, embeddingInput, embedding, embeddingModel: MODEL, deriveComplete: true };
}

let client: GoogleGenAI | null = null;
const generateWithGemini: GenerateFn = async (req) => {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await client.models.generateContent({
    model: GENERATE_MODEL,
    contents: req.input,
    config: {
      systemInstruction: req.systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          vibeTags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['summary', 'vibeTags'],
      },
    },
  });
  return JSON.parse(res.text ?? '{}');
};
