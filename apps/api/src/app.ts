import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler, hasZodFastifySchemaValidationErrors,
         isResponseSerializationError, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { healthResponse } from '@vegan-bangkok/schemas';
import { env } from './env.ts';
import { embed as realEmbed } from './embed/gemini.ts';
import { searchRoutes } from './routes/search.ts';
import { scanMenuRoutes } from './routes/scanMenu.ts';
import { itineraryRoutes } from './routes/itinerary.ts';
import { chatRoutes } from './routes/chat.ts';
import type { NarrateFn } from './itinerary/narrative.ts';
import type { OllamaStreamFn } from './chat/ollama.ts';
import { extractLines, terminateOcr, type OcrLine } from './ocr/extractText.ts';
import { extractLinesPaddle } from './ocr/ocrPaddle.ts';

export type BuildOpts = {
  embedFn?: (texts: string[]) => Promise<number[][]>;
  ocrFn?: (imageBuffer: Buffer) => Promise<OcrLine[]>;
  narrateFn?: NarrateFn;
  ollamaFn?: OllamaStreamFn;
};

export async function buildApp(opts: BuildOpts = {}) {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
      ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
  }).withTypeProvider<ZodTypeProvider>();       // returns a NEW typed instance — register on this

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  // fastify 5.9 defaults TError to unknown — pin FastifyError so statusCode/name/message typecheck
  app.setErrorHandler<FastifyError>((err, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) return reply.code(400).send({ error: 'ValidationError', issues: err.validation });
    if (isResponseSerializationError(err)) { req.log.error(err); return reply.code(500).send({ error: 'ResponseSchemaMismatch' }); }
    req.log.error(err); return reply.code(err.statusCode ?? 500).send({ error: err.name, message: err.message });
  });

  await app.register(sensible);
  await app.register(cors, { origin: env.NODE_ENV === 'production' ? env.CORS_ORIGIN : true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });   // in-memory: fine for one replica

  app.get('/health', { schema: { response: { 200: healthResponse } } },
    async () => ({ status: 'ok' as const, uptime: process.uptime() }));

  // v1's API is search-only: POST /search + GET /dishes/:id/similar. The catalog (places/dishes)
  // is read from the bundled JSON on-device, so there is NO GET /places endpoint.
  const embedFn = opts.embedFn ?? ((t: string[]) => realEmbed(t, 'RETRIEVAL_QUERY'));
  // OCR provider: PaddleOCR sidecar when OCR_URL is set (far better Thai), else in-process
  // Tesseract.js. Overridable in tests via opts.ocrFn.
  const defaultOcr = process.env.OCR_URL ? (buf: Buffer) => extractLinesPaddle(buf) : extractLines;
  await app.register(searchRoutes, { embedFn });
  await app.register(scanMenuRoutes, { embedFn, ocrFn: opts.ocrFn ?? defaultOcr });
  await app.register(itineraryRoutes, { embedFn, narrateFn: opts.narrateFn });
  await app.register(chatRoutes, { embedFn, ollamaFn: opts.ollamaFn });
  app.addHook('onClose', () => terminateOcr());   // free the Tesseract worker thread on drain
  return app;
}
