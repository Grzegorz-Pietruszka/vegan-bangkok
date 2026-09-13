import { createSseParser } from '../sse';

test('parses complete events and survives chunk splits mid-line', () => {
  const events: { event: string; data: string }[] = [];
  const push = createSseParser((ev) => events.push(ev));
  push('event: results\ndata: {"results":[]}\n\nevent: tok');
  push('en\ndata: {"t":"hi"}\n\n');
  expect(events).toEqual([
    { event: 'results', data: '{"results":[]}' },
    { event: 'token', data: '{"t":"hi"}' },
  ]);
});

test('multiple events in one chunk', () => {
  const events: { event: string }[] = [];
  const push = createSseParser((ev) => events.push(ev));
  push('event: token\ndata: {"t":"a"}\n\nevent: token\ndata: {"t":"b"}\n\nevent: done\ndata: {}\n\n');
  expect(events.map((e) => e.event)).toEqual(['token', 'token', 'done']);
});
