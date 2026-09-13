import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { chatRequest, type DishResult } from '@vegan-bangkok/schemas';
import { env } from '../env.ts';
import { retrieveForChat } from '../chat/retrieve.ts';
import { buildChatPrompt, type ChatCandidate } from '../chat/prompt.ts';
import { streamOllama, type OllamaStreamFn } from '../chat/ollama.ts';

type Opts = { embedFn: (texts: string[]) => Promise<number[][]>; ollamaFn?: OllamaStreamFn };

// CPU model: one chat at a time (retrieval + generation); module state is fine on a
// single replica (same stance as the in-memory rate limiter). Check-and-set happens
// synchronously before the handler's first await so two chats can't interleave through
// the retrieval window.
let generating = false;

function toCandidate(r: DishResult): ChatCandidate {
  const nearest = [...r.places].sort((a, b) =>
    ((a as { distanceM?: number }).distanceM ?? Infinity) - ((b as { distanceM?: number }).distanceM ?? Infinity))[0];
  return {
    nameEn: r.nameEn, nameTh: r.nameTh, description: r.description,
    spiceLevel: r.spiceLevel, tags: r.tags,
    placeName: nearest?.name ?? null,
    distanceM: (nearest as { distanceM?: number } | undefined)?.distanceM ?? null,
  };
}

function templateLine(results: DishResult[]): string {
  if (results.length === 0) return 'Nothing in the catalog matches that craving yet — try different words.';
  const top = results[0];
  const place = top.places[0];
  return `Try ${top.nameEn}${place ? ` at ${place.name}` : ''} — the closest match to what you're craving.`;
}

export const chatRoutes: FastifyPluginAsyncZod<Opts> = async (app, opts) => {
  app.post('/chat', { schema: { body: chatRequest } }, async (req, reply) => {
    if (generating) return reply.code(429).send({ error: 'busy' });
    generating = true;                    // set BEFORE the retrieval await — no race window
    try {
      const { results, degraded: retrievalDegraded } = await retrieveForChat(
        req.body.q, req.body.location, { embed: opts.embedFn });

      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const send = (event: string, data: unknown) =>
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      send('results', { results });

      const defaultOllama: OllamaStreamFn | null =
        env.OLLAMA_URL && env.OLLAMA_MODEL
          ? (s, u) => streamOllama(s, u, { url: env.OLLAMA_URL!, model: env.OLLAMA_MODEL! })
          : null;
      const ollama = opts.ollamaFn ?? defaultOllama;

      let degraded: 'retrieval' | 'generation' | undefined =
        retrievalDegraded ? 'retrieval' : undefined;

      if (results.length === 0 || !ollama) {
        send('token', { t: templateLine(results) });
        if (results.length > 0 && !ollama) degraded = degraded ?? 'generation';
      } else {
        try {
          const { system, user } = buildChatPrompt(req.body.q, results.map(toCandidate));
          for await (const chunk of ollama(system, user)) send('token', { t: chunk });
        } catch (err) {
          req.log.warn({ err }, 'chat generation failed — template fallback');
          send('token', { t: templateLine(results) });
          degraded = degraded ?? 'generation';
        }
      }

      send('done', degraded ? { degraded } : {});
      reply.raw.end();
      return reply;   // raw reply taken over — tells fastify not to serialize
    } finally {
      generating = false;                 // release on every path, including throws
    }
  });
};
