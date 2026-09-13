import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

function waitForListen(stream: NodeJS.ReadableStream): Promise<void> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('server did not report listening in time')), 15000);
    stream.on('data', (d) => {
      buf += String(d);
      if (/Server listening at/.test(buf)) { clearTimeout(t); resolve(); }
    });
  });
}

test('server boots, serves /health, and exits 0 on SIGTERM', async () => {
  const port = 3987;
  const child = spawn('node', ['--import', './src/instrument.ts', 'src/server.ts'], {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port),
           DATABASE_URL: 'postgres://user:pw@localhost:5432/vb' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForListen(child.stdout!);
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { status: string }).status, 'ok');

  child.kill('SIGTERM');
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
});
