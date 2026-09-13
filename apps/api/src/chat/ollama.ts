export type OllamaStreamFn = (system: string, user: string) => AsyncIterable<string>;

// Ollama /api/chat streams ndjson: {"message":{"content":"..."},"done":false} per line.
export async function* streamOllama(
  system: string, user: string,
  opts: { url: string; model: string; timeoutMs?: number },
): AsyncIterable<string> {
  const res = await fetch(`${opts.url}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: opts.model, stream: true,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });
  if (!res.ok || !res.body) throw new Error(`ollama ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
      if (chunk.message?.content) yield chunk.message.content;
      if (chunk.done) return;
    }
  }
}
