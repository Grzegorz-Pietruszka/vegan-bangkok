import 'server-only';

const OCR_URL = process.env.OCR_URL ?? 'http://127.0.0.1:8091';

export async function tokenizeLines(lines: string[]): Promise<string[][]> {
  const res = await fetch(`${OCR_URL}/tokenize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lines }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`tokenize sidecar ${res.status}`);
  const data = (await res.json()) as { tokens: string[][] };
  return data.tokens;
}
