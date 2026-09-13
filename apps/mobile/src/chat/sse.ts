// Minimal incremental SSE parser — only what our own /chat endpoint emits
// (single event: + data: line pairs, \n\n separated). Not a general SSE client.
export function createSseParser(
  onEvent: (ev: { event: string; data: string }) => void,
): (chunk: string) => void {
  let buf = '';
  return (chunk: string) => {
    buf += chunk;
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const event = /event: (.+)/.exec(block)?.[1];
      const data = /data: (.+)/.exec(block)?.[1];
      if (event && data !== undefined) onEvent({ event, data });
    }
  };
}
