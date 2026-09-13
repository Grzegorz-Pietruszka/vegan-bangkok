import { z } from 'zod';
export * from './domain.js';
export const healthResponse = z.object({ status: z.literal('ok'), uptime: z.number() });
export type HealthResponse = z.infer<typeof healthResponse>;
