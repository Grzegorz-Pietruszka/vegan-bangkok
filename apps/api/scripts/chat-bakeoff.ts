// apps/api/scripts/chat-bakeoff.ts — run 5 fixed cravings against both candidate
// models over IDENTICAL retrieved context; print answers + latency side by side.
// Usage: node --env-file-if-exists=.env scripts/chat-bakeoff.ts
import { buildChatPrompt } from '../src/chat/prompt.ts';
import { streamOllama } from '../src/chat/ollama.ts';
import { retrieveForChat } from '../src/chat/retrieve.ts';
import { embed } from '../src/embed/gemini.ts';
import { pool } from '../src/db/index.ts';

const MODELS = ['qwen2.5:3b-instruct', 'llama3.2:3b'];
const URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const CRAVINGS = [
  'something not spicy near me',
  'rainy day comfort soup',
  'a quick cheap lunch, nothing fried',
  'ข้าวซอย',
  'sweet dessert after a spicy meal',
];

for (const q of CRAVINGS) {
  const { results } = await retrieveForChat(q, { lat: 13.7515, lng: 100.492 },
    { embed: (t) => embed(t, 'RETRIEVAL_QUERY') });
  const { system, user } = buildChatPrompt(q, results.map((r) => ({
    nameEn: r.nameEn, nameTh: r.nameTh, description: r.description,
    spiceLevel: r.spiceLevel, tags: r.tags,
    placeName: r.places[0]?.name ?? null,
    distanceM: (r.places[0] as { distanceM?: number } | undefined)?.distanceM ?? null,
  })));
  console.log(`\n=== ${q} ===`);
  for (const model of MODELS) {
    const t0 = performance.now();
    let text = '';
    try {
      for await (const c of streamOllama(system, user, { url: URL, model, timeoutMs: 120_000 })) text += c;
    } catch (e) { text = `ERROR: ${e}`; }
    console.log(`\n[${model}] (${Math.round(performance.now() - t0)} ms)\n${text}`);
  }
}
await pool.end();
