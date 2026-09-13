import { fetch as expoFetch } from 'expo/fetch';
import type { DishResult } from '@vegan-bangkok/schemas';
import { API_BASE, HttpError } from './base';
import { createSseParser } from '@/chat/sse';

export type CravingHandlers = {
  onResults: (r: DishResult[]) => void;
  onToken: (t: string) => void;
  onDone: (degraded?: string) => void;
  onError: (e: unknown) => void;
};

// expo/fetch supports ReadableStream response bodies (RN fetch does not).
export async function streamCraving(
  req: { q: string; location?: { lat: number; lng: number } },
  h: CravingHandlers,
): Promise<void> {
  try {
    const res = await expoFetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new HttpError(res.status);
    if (!res.body) throw new Error('chat: response had no stream body');
    const parse = createSseParser(({ event, data }) => {
      if (event === 'results') h.onResults(JSON.parse(data).results as DishResult[]);
      else if (event === 'token') h.onToken(JSON.parse(data).t as string);
      else if (event === 'done') h.onDone(JSON.parse(data).degraded as string | undefined);
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parse(decoder.decode(value, { stream: true }));
    }
  } catch (e) {
    h.onError(e);
  }
}
