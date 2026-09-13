import { createWorker, PSM, type Worker } from 'tesseract.js';
import sharp from 'sharp';

// Tesseract.js OCR wrapper (plan 11, Task 3). Self-hosted: tha+eng traineddata is vendored
// in apps/api/tessdata (tessdata_fast), so no network and no per-scan cost. Known quality
// ceiling vs PaddleOCR — a deliberate v1 trade recorded in brainstorming/tech-adoption-guide.md.

export type OcrLine = { text: string; confidence: number };

const TESSDATA_DIR = new URL('../../tessdata', import.meta.url).pathname;

// Preprocessing per Tesseract's official guidance (see brainstorming/orc-tech.md): grayscale,
// contrast-stretch, and upscale small photos toward ~300-DPI-equivalent width. `rotate()`
// applies EXIF orientation first; the re-encode then drops ALL metadata (EXIF/GPS) — the
// buffer that reaches OCR is privacy-clean by construction.
const TARGET_WIDTH = 2000;
export async function preprocessImage(input: Buffer): Promise<Buffer> {
  const oriented = sharp(input).rotate();
  const { width = 0 } = await oriented.metadata();
  let p = oriented.removeAlpha().grayscale().normalize();
  if (width > 0 && width < TARGET_WIDTH) p = p.resize({ width: TARGET_WIDTH });
  // toColourspace forces a true 1-channel encode — grayscale() alone can re-emit srgb PNG
  return p.toColourspace('b-w').png().toBuffer();
}

// ponytail: one lazy singleton worker — scans serialize on it. A scheduler pool is the
// upgrade if concurrent scans ever measurably queue.
let workerPromise: Promise<Worker> | null = null;
function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const worker = await createWorker(['tha', 'eng'], 1, {
      langPath: TESSDATA_DIR,     // vendored *.traineddata.gz
      gzip: true,
      cacheMethod: 'none',        // read from langPath directly, never copy elsewhere
    });
    // SPARSE_TEXT, not AUTO: real menu photos are multi-column with scattered price tags —
    // AUTO's layout analysis found 2 of 9 lines on the photographed fixture, sparse found
    // them all. Line ORDER is meaningless under sparse, which is fine: the scan pipeline
    // matches every line independently.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    return worker;
  })();
  return workerPromise;
}

export async function extractLines(imageBuffer: Buffer): Promise<OcrLine[]> {
  const worker = await getWorker();
  const pre = await preprocessImage(imageBuffer);
  const { data } = await worker.recognize(pre, {}, { blocks: true });
  const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
  return lines
    .map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), confidence: l.confidence }))
    .filter((l) => l.text.length > 0);
}

export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    workerPromise = null;
    await w.terminate();
  }
}
