import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import multipart from '@fastify/multipart';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { scanMenuResponse } from '@vegan-bangkok/schemas';
import { scanMenu } from '../ocr/scanPipeline.ts';
import type { OcrLine } from '../ocr/extractText.ts';

type Opts = {
  embedFn: (texts: string[]) => Promise<number[][]>;
  ocrFn: (imageBuffer: Buffer) => Promise<OcrLine[]>;
};

// PRIVACY CONTRACT (plan 11): the uploaded photo is NEVER persisted — streamed to a temp
// path, OCR'd, and deleted in a finally block on every path. EXIF is never read here (no
// metadata parse; the OCR preprocessing re-encode drops it), and nothing about the file —
// name, EXIF, location — is logged.
const FILE_SIZE_LIMIT = 10 * 1024 * 1024;   // photos; the fastify default 1 MiB is far too small

export const scanMenuRoutes: FastifyPluginAsyncZod<Opts> = async (app, opts) => {
  // registered inside this plugin scope so multipart parsing exists only for /scan-menu
  await app.register(multipart, { limits: { fileSize: FILE_SIZE_LIMIT, files: 1 } });

  app.post('/scan-menu', { schema: { response: { 200: scanMenuResponse } } }, async (req, reply) => {
    const data = await req.file();
    if (!data) throw app.httpErrors.badRequest('multipart file field required');
    if (!data.mimetype.startsWith('image/')) {
      throw app.httpErrors.unsupportedMediaType('image uploads only');
    }

    const tempPath = join(tmpdir(), `menu-scan-${randomUUID()}`);
    try {
      await pipeline(data.file, createWriteStream(tempPath, { mode: 0o600 }));
      if (data.file.truncated) throw app.httpErrors.payloadTooLarge('image exceeds 10 MiB');
      const lines = await opts.ocrFn(await readFile(tempPath));
      const items = await scanMenu(lines, { embedFn: opts.embedFn });
      return { items };
    } finally {
      await rm(tempPath, { force: true });   // success, OCR failure, size abort — always gone
    }
  });
};
