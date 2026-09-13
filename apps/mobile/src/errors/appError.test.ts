import { HttpError } from '@/api/base';
import { normalizeError, type ErrorCode } from './appError';

describe('normalizeError HTTP mappings', () => {
  const cases: [number, ErrorCode, boolean][] = [
    [400, 'validation', false],
    [422, 'validation', false],
    [401, 'auth', false],
    [403, 'forbidden', false],
    [404, 'not_found', false],
    [409, 'conflict', true],
    [429, 'rate_limited', true],
    [500, 'server', true],
    [503, 'server', true],
    [418, 'unknown', false],
  ];
  test.each(cases)('HTTP %i → %s (retryable=%s)', (status, code, retryable) => {
    const err = normalizeError(new HttpError(status));
    expect(err.code).toBe(code);
    expect(err.retryable).toBe(retryable);
    expect(err.status).toBe(status);
  });

  test('extracts field errors from a 422 body ({errors} and {fieldErrors} shapes)', () => {
    expect(normalizeError(new HttpError(422, { errors: { name: 'Too long' } })).fieldErrors)
      .toEqual({ name: 'Too long' });
    expect(normalizeError(new HttpError(400, { fieldErrors: { q: 'Required' } })).fieldErrors)
      .toEqual({ q: 'Required' });
    // non-string values dropped; nothing usable → undefined
    expect(normalizeError(new HttpError(422, { errors: { n: 42 } })).fieldErrors).toBeUndefined();
    expect(normalizeError(new HttpError(422, 'plain text')).fieldErrors).toBeUndefined();
  });
});

describe('normalizeError non-HTTP failures', () => {
  test('fetch network failure → offline, retryable', () => {
    const err = normalizeError(new TypeError('Network request failed'));
    expect(err.code).toBe('offline');
    expect(err.retryable).toBe(true);
  });

  test('AbortSignal.timeout / manual abort → timeout, retryable', () => {
    for (const name of ['TimeoutError', 'AbortError']) {
      const e = new Error('signal timed out');
      e.name = name;
      const err = normalizeError(e);
      expect(err.code).toBe('timeout');
      expect(err.retryable).toBe(true);
    }
  });

  test('never leaks raw error internals into userMessage; preserves cause', () => {
    const raw = new Error('ECONNREFUSED http://internal-db:5432/secrets sql=SELECT *');
    const err = normalizeError(raw);
    expect(err.code).toBe('unknown');
    expect(err.userMessage).not.toMatch(/ECONNREFUSED|internal-db|SELECT/);
    expect(err.userMessage.length).toBeGreaterThan(0);
    expect(err.cause).toBe(raw);
  });

  test('already-normalized errors pass through unchanged', () => {
    const once = normalizeError(new HttpError(500));
    expect(normalizeError(once)).toBe(once);
  });
});
