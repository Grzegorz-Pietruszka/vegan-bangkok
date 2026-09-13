import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { streamOllama } from '../../src/chat/ollama.ts';

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const parsed = JSON.parse(body);
    assert.equal(parsed.stream, true);
    assert.equal(parsed.messages[0].role, 'system');
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(JSON.stringify({ message: { content: 'Try ' }, done: false }) + '\n');
    res.write(JSON.stringify({ message: { content: 'khao soi.' }, done: false }) + '\n');
    res.end(JSON.stringify({ message: { content: '' }, done: true }) + '\n');
  });
});
await new Promise<void>((r) => server.listen(0, r));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
after(() => server.close());

test('streamOllama yields content chunks until done', async () => {
  const chunks: string[] = [];
  for await (const c of streamOllama('sys', 'user', { url, model: 'test-model' })) chunks.push(c);
  assert.deepEqual(chunks, ['Try ', 'khao soi.']);
});

test('streamOllama rejects on connection failure', async () => {
  const iter = streamOllama('s', 'u', { url: 'http://127.0.0.1:1', model: 'x', timeoutMs: 2000 });
  await assert.rejects(async () => { for await (const _ of iter) { /* drain */ } });
});
