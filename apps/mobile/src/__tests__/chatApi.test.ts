import { streamCraving } from '@/api/chat';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
import { fetch as expoFetch } from 'expo/fetch';
const mockFetch = expoFetch as jest.MockedFunction<typeof expoFetch>;

function sseResponse(...blocks: string[]) {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () =>
          i < blocks.length ? { done: false, value: enc.encode(blocks[i++]) } : { done: true, value: undefined },
      }),
    },
    // expo/fetch doesn't export its FetchResponse class type — derive it from the fn.
  } as unknown as Awaited<ReturnType<typeof expoFetch>>;
}

test('dispatches results, tokens, done in order', async () => {
  mockFetch.mockResolvedValue(sseResponse(
    'event: results\ndata: {"results":[{"id":"x"}]}\n\n',
    'event: token\ndata: {"t":"Try "}\n\nevent: token\ndata: {"t":"it."}\n\n',
    'event: done\ndata: {"degraded":"generation"}\n\n',
  ));
  const calls: string[] = [];
  let doneArg: string | undefined = 'unset';
  await streamCraving({ q: 'soup' }, {
    onResults: (r) => calls.push(`results:${r.length}`),
    onToken: (t) => calls.push(`t:${t}`),
    onDone: (d) => { doneArg = d; calls.push('done'); },
    onError: () => calls.push('error'),
  });
  expect(calls).toEqual(['results:1', 't:Try ', 't:it.', 'done']);
  expect(doneArg).toBe('generation');
});

test('network failure routes to onError', async () => {
  mockFetch.mockRejectedValue(new Error('offline'));
  const calls: string[] = [];
  await streamCraving({ q: 'soup' }, {
    onResults: () => calls.push('results'),
    onToken: () => calls.push('t'),
    onDone: () => calls.push('done'),
    onError: () => calls.push('error'),
  });
  expect(calls).toEqual(['error']);
});
