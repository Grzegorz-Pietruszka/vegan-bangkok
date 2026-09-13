import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { extractLines, preprocessImage, terminateOcr } from '../src/ocr/extractText.ts';

// Fixtures are REAL crops from the provided menu photos (ocr/menu-images/), not synthetic
// renders — Thai menu typography and photo artifacts are the actual hard case.
const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url));

after(() => terminateOcr());   // the worker thread would otherwise keep the runner alive

test('clear photographed menu block → non-empty lines including recognizable Thai', async () => {
  const lines = await extractLines(await fixture('menu-photo-block.png'));
  assert.ok(lines.length >= 3, `expected ≥3 lines, got ${lines.length}`);
  for (const l of lines) {
    assert.equal(typeof l.text, 'string');
    assert.ok(l.text.length > 0, 'empty lines must be filtered out');
    assert.ok(l.confidence >= 0 && l.confidence <= 100, `confidence out of range: ${l.confidence}`);
  }
  const joined = lines.map((l) => l.text).join(' ');
  assert.ok(/[ก-๛]/.test(joined), 'must recognize Thai script');
});

test('clean digital menu → Thai dish-name text comes through', async () => {
  const lines = await extractLines(await fixture('dumpling-clean.png'));
  const joined = lines.map((l) => l.text).join(' ');
  // จากพืช ("from plants") is inside every dish name on this menu; asserting on it keeps the
  // test stable against Tesseract's known tone-mark confusion (เกี๊ยว ↔ เกี่ยว).
  assert.ok(/จากพืช/.test(joined), `dish-name text missing from: ${joined}`);
});

test('stylized-header fixture → low-confidence result, not a throw', async () => {
  const hard = await extractLines(await fixture('low-quality.png'));
  const clear = await extractLines(await fixture('dumpling-clean.png'));
  const mean = (ls: { confidence: number }[]) =>
    ls.length === 0 ? 0 : ls.reduce((s, l) => s + l.confidence, 0) / ls.length;
  // the decorative-font-on-artwork crop must come back strictly less confident than clean text
  assert.ok(mean(hard) < mean(clear),
    `hard fixture should be lower confidence (hard=${mean(hard)}, clear=${mean(clear)})`);
});

test('preprocessing: grayscale + upscale toward the 300-DPI guidance, EXIF dropped', async () => {
  const raw = await fixture('menu-photo-block.png');    // 620px wide crop
  const pre = await preprocessImage(raw);
  const meta = await sharp(pre).metadata();
  assert.ok((meta.width ?? 0) >= 1800, `small images must be upscaled, got width ${meta.width}`);
  assert.ok((meta.channels ?? 3) <= 2, `must be grayscale, got ${meta.channels} channels`);
  assert.equal(meta.exif, undefined, 'no EXIF may survive preprocessing');
});
