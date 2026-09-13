import i18n from '@/i18n';
import { HttpError } from '@/api/base';

// One normalized shape for every failure in the app. userMessage is the ONLY string a
// user ever sees — raw exception text, statuses, and backend payloads stay in `cause`
// for Sentry. Screens branch on `code`/`retryable`, never on message strings.
export type ErrorCode =
  | 'offline' | 'timeout' | 'validation' | 'auth' | 'forbidden'
  | 'not_found' | 'conflict' | 'rate_limited' | 'server' | 'unknown';

export type AppError = {
  code: ErrorCode;
  userMessage: string;
  fieldErrors?: Record<string, string>;
  severity: 'warning' | 'error';
  retryable: boolean;
  status?: number;
  cause: unknown;
};

// Literal-key map keeps i18next's typed t() happy (dynamic `errors.${code}` wouldn't).
const MESSAGE_KEY = {
  offline: 'errors.offline',
  timeout: 'errors.timeout',
  validation: 'errors.validation',
  auth: 'errors.auth',
  forbidden: 'errors.forbidden',
  not_found: 'errors.not_found',
  conflict: 'errors.conflict',
  rate_limited: 'errors.rate_limited',
  server: 'errors.server',
  unknown: 'errors.unknown',
} as const satisfies Record<ErrorCode, string>;

export function isAppError(e: unknown): e is AppError {
  return !!e && typeof e === 'object' && 'code' in e && 'userMessage' in e && 'retryable' in e;
}

function make(code: ErrorCode, cause: unknown, extra?: Partial<AppError>): AppError {
  return {
    code,
    userMessage: i18n.t(MESSAGE_KEY[code]),
    severity: 'error',
    retryable: false,
    cause,
    ...extra,
  };
}

// Accepts `{ fieldErrors: {...} }` or `{ errors: {...} }` bodies; keeps string values only.
function extractFieldErrors(body: unknown): Record<string, string> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const raw = (body as Record<string, unknown>).fieldErrors ?? (body as Record<string, unknown>).errors;
  if (!raw || typeof raw !== 'object') return undefined;
  const entries = Object.entries(raw).filter((kv): kv is [string, string] => typeof kv[1] === 'string');
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function fromStatus(e: HttpError): AppError {
  const s = e.status;
  if (s === 400 || s === 422)
    return make('validation', e, { status: s, fieldErrors: extractFieldErrors(e.body) });
  // ponytail: no auth/token-refresh flow exists in this app yet (plan-02 seam). When it
  // lands, attempt the refresh here and only fall through to 'auth' if refresh fails.
  if (s === 401) return make('auth', e, { status: s });
  if (s === 403) return make('forbidden', e, { status: s });
  if (s === 404) return make('not_found', e, { status: s });
  if (s === 409) return make('conflict', e, { status: s, retryable: true });
  if (s === 429) return make('rate_limited', e, { status: s, retryable: true, severity: 'warning' });
  if (s >= 500) return make('server', e, { status: s, retryable: true });
  return make('unknown', e, { status: s });
}

export function normalizeError(e: unknown): AppError {
  if (isAppError(e)) return e; // already normalized — never double-wrap
  if (e instanceof HttpError) return fromStatus(e);
  if (e instanceof Error) {
    // AbortSignal.timeout() rejects with name 'TimeoutError'; manual aborts with 'AbortError'.
    if (e.name === 'TimeoutError' || e.name === 'AbortError')
      return make('timeout', e, { retryable: true });
    // RN fetch and expo/fetch both throw TypeError("Network request failed") when the
    // device is offline or the host is unreachable.
    if (e instanceof TypeError) return make('offline', e, { retryable: true, severity: 'warning' });
  }
  return make('unknown', e, { retryable: true });
}
