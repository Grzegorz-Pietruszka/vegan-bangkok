import sharp from 'sharp';
import type { OcrLine } from './extractText.ts';

// Client for the PaddleOCR Thai sidecar (ocr-service/). PaddleOCR reads photographed Thai
// menus far better than the in-process Tesseract.js path — see the plan-11 OCR-upgrade notes.
// Selected at wiring time by the presence of env OCR_URL; falls back to Tesseract otherwise.
//
// Privacy parity with the Tesseract path: sharp re-encodes (dropping EXIF) and applies
// orientation before the buffer leaves this process. The sidecar holds it only in memory.
export async function extractLinesPaddle(imageBuffer: Buffer, url = process.env.OCR_URL!): Promise<OcrLine[]> {
  const clean = await sharp(imageBuffer).rotate().jpeg({ quality: 90 }).toBuffer();
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(clean)], { type: 'image/jpeg' }), 'menu.jpg');

  const res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`ocr sidecar ${res.status}`);
  const body = (await res.json()) as { lines?: OcrLine[] };
  return (body.lines ?? []).filter((l) => l.text.trim().length > 0);
}
