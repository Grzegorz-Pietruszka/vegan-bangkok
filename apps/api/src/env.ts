import { z } from 'zod';
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.url(),
  CORS_ORIGIN: z.string().optional(),
  // Railway persists a cleared var as '' — accept blank as undefined so an empty SENTRY_DSN never fails boot.
  SENTRY_DSN: z.union([z.url(), z.literal('')]).optional().transform((v) => v || undefined),
  // Ollama sidecar (craving chat). Absent → chat answers degraded; boot never blocks.
  OLLAMA_URL: z.union([z.url(), z.literal('')]).optional().transform((v) => v || undefined),
  OLLAMA_MODEL: z.string().optional(),
}).refine((e) => e.NODE_ENV !== 'production' || !!e.CORS_ORIGIN, {
  // app.ts hands env.CORS_ORIGIN straight to @fastify/cors in production — never let it be undefined there.
  message: 'CORS_ORIGIN is required when NODE_ENV=production',
  path: ['CORS_ORIGIN'],
});
const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) { console.error('Invalid environment:\n' + z.prettifyError(parsed.error)); process.exit(1); }
export const env = parsed.data;
