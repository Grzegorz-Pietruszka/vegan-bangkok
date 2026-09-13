import { GoogleGenAI } from '@google/genai';

export const MODEL = 'gemini-embedding-001';
export type TaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

// Testable core: takes any client with models.embedContent.
export async function embedWith(
  client: { models: { embedContent: (req: unknown) => Promise<{ embeddings?: { values?: number[] }[] }> } },
  texts: string[],
  taskType: TaskType,
): Promise<number[][]> {
  const res = await client.models.embedContent({
    model: MODEL,
    contents: texts,
    config: { taskType, outputDimensionality: 1536 },
  });
  // @google/genai types `embeddings` and each `values` as optional — guard so an error/quota
  // response fails loudly with context instead of an opaque `undefined` TypeError.
  const embeddings = res.embeddings;
  if (!embeddings || embeddings.length !== texts.length) {
    throw new Error(`embedding count mismatch: expected ${texts.length}, got ${embeddings?.length ?? 0}`);
  }
  // 001 truncated dims are not renormalized server-side — L2-normalize.
  return embeddings.map((e, i) => {
    if (!e.values?.length) throw new Error(`missing embedding values at index ${i}`);
    return l2normalize(e.values);
  });
}

function l2normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

let singleton: GoogleGenAI | null = null;
export function embed(texts: string[], taskType: TaskType): Promise<number[][]> {
  singleton ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return embedWith(singleton as any, texts, taskType);
}
