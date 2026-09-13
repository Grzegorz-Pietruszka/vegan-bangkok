type Interval = { open: string; close: string };

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const pad = (n: number) => String(n).padStart(2, '0');

function bangkokParts(now: Date): { dayIndex: number; time: string } {
  const bkk = new Date(now.getTime() + 7 * 3600_000);
  return {
    dayIndex: bkk.getUTCDay(),
    time: `${pad(bkk.getUTCHours())}:${pad(bkk.getUTCMinutes())}`,
  };
}

function intervals(hours: unknown, day: string): Interval[] {
  if (!hours || typeof hours !== 'object') return [];
  const v = (hours as Record<string, unknown>)[day];
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is Interval =>
    !!r && typeof r === 'object'
    && typeof (r as Interval).open === 'string' && typeof (r as Interval).close === 'string');
}

export function isOpenNow(hours: unknown, now: Date = new Date()): boolean {
  const { dayIndex, time } = bangkokParts(now);

  const tail = intervals(hours, DAYS[(dayIndex + 6) % 7]);
  if (tail.some((r) => r.close <= r.open && time < r.close)) return true;

  const today = intervals(hours, DAYS[dayIndex]);
  return today.some((r) => (r.close > r.open ? time >= r.open && time < r.close : time >= r.open));
}
