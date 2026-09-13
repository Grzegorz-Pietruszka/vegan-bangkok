import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullTranslationProvider } from '../src/ocr/translationProvider.ts';

test('NullTranslationProvider resolves null fast, never throws, never touches the network', async () => {
  const origFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    fetchCalls++;
    return origFetch(...args);
  }) as typeof fetch;
  try {
    const p = new NullTranslationProvider();
    const started = Date.now();
    for (const text of ['เกี๊ยวจากพืชรสเห็ดหอม', '', '   ', 'x'.repeat(10_000)]) {
      assert.equal(await p.translate(text), null);
    }
    assert.ok(Date.now() - started < 50, 'must be synchronously-fast, no I/O in the path');
    assert.equal(fetchCalls, 0, 'no network call may be made');
  } finally {
    globalThis.fetch = origFetch;
  }
});
