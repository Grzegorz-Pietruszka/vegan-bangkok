import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { sql } from 'drizzle-orm';
import { buildApp } from '../src/app.ts';
import { db, pool } from '../src/db/index.ts';
import { seedDatabase } from '../seed/seed.ts';

// Integration tests for POST /scan-menu. OCR is INJECTED (Task 3 tests the real engine);
// what's under test here: multipart handling, limits, and the privacy contract — the
// uploaded photo must be GONE from disk after every request, success or failure.

before(async () => {
  await db.execute(sql`TRUNCATE regions, dishes, places, place_dishes, menu_scan_misses RESTART IDENTITY CASCADE`);
  await seedDatabase(db);
});
after(() => pool.end());

const FAKE_LINES = [
  { text: 'ผัดซีอิ๊ว Pad See Ew 60.-', confidence: 88 },
  { text: 'ผัดผักกาดขาวน้ำมันหอย 80.-', confidence: 84 },
  { text: 'เกี๊ยวทอดรสผัดพริกแกง 89', confidence: 79 },
];
const fakeOcr = async () => FAKE_LINES;
const noEmbed = async () => { throw new Error('down'); };

function multipartBody(content: Buffer, { filename = 'menu.png', contentType = 'image/png', field = 'photo' } = {}) {
  const boundary = '----vbScanTestBoundary';
  const head = Buffer.from(
    `--${boundary}\r\ncontent-disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
    `content-type: ${contentType}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, content, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function scanTempFiles(): Promise<string[]> {
  return (await readdir(tmpdir())).filter((f) => f.startsWith('menu-scan-'));
}

const fixture = () => readFile(new URL('./fixtures/menu-photo-block.png', import.meta.url));

test('valid image upload → 200 with typed MenuScanItem[]', async () => {
  const app = await buildApp({ embedFn: noEmbed, ocrFn: fakeOcr });
  const { payload, headers } = multipartBody(await fixture());
  const res = await app.inject({ method: 'POST', url: '/scan-menu', payload, headers });
  assert.equal(res.statusCode, 200, res.body);
  const { items } = res.json();
  assert.equal(items.length, 3);
  const [matched, flagged, unmatched] = items;
  assert.equal(matched.type, 'matched');
  assert.equal(matched.dish.nameEn, 'Pad see ew');
  assert.equal(flagged.type, 'ingredient_flagged');
  assert.equal(flagged.ingredientFlags[0].nameEn, 'Oyster sauce');
  assert.equal(unmatched.type, 'unmatched');
  assert.equal(unmatched.translation, null);
  await app.close();
});

test('PRIVACY: temp upload file is gone from disk after the request (success path)', async () => {
  const app = await buildApp({ embedFn: noEmbed, ocrFn: fakeOcr });
  const { payload, headers } = multipartBody(await fixture());
  const res = await app.inject({ method: 'POST', url: '/scan-menu', payload, headers });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(await scanTempFiles(), [], 'no menu-scan-* temp file may survive the request');
  await app.close();
});

test('PRIVACY: temp upload file is gone even when OCR throws (finally path)', async () => {
  const app = await buildApp({ embedFn: noEmbed, ocrFn: async () => { throw new Error('ocr exploded'); } });
  const { payload, headers } = multipartBody(await fixture());
  const res = await app.inject({ method: 'POST', url: '/scan-menu', payload, headers });
  assert.ok(res.statusCode >= 500, 'ocr failure surfaces as an error');
  assert.deepEqual(await scanTempFiles(), [], 'cleanup must run in finally, not on the happy path only');
  await app.close();
});

test('non-image upload → 415, not a crash', async () => {
  const app = await buildApp({ embedFn: noEmbed, ocrFn: fakeOcr });
  const { payload, headers } = multipartBody(Buffer.from('just text'), { filename: 'menu.txt', contentType: 'text/plain' });
  const res = await app.inject({ method: 'POST', url: '/scan-menu', payload, headers });
  assert.equal(res.statusCode, 415);
  assert.deepEqual(await scanTempFiles(), []);
  await app.close();
});

test('oversized upload → 413, temp file cleaned up', async () => {
  const app = await buildApp({ embedFn: noEmbed, ocrFn: fakeOcr });
  const { payload, headers } = multipartBody(Buffer.alloc(11 * 1024 * 1024, 7)); // > 10 MiB limit
  const res = await app.inject({ method: 'POST', url: '/scan-menu', payload, headers });
  assert.equal(res.statusCode, 413);
  assert.deepEqual(await scanTempFiles(), []);
  await app.close();
});

test('no file part at all → 400', async () => {
  const app = await buildApp({ embedFn: noEmbed, ocrFn: fakeOcr });
  const res = await app.inject({ method: 'POST', url: '/scan-menu',
    payload: '--x--\r\n', headers: { 'content-type': 'multipart/form-data; boundary=x' } });
  assert.equal(res.statusCode, 400);
  await app.close();
});
