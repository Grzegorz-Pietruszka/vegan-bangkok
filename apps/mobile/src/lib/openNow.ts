type Range = { open: string; close: string };
type Hours = Partial<Record<string, Range[]>> | null | undefined;

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// hours shape: { mon: [{open:'09:00', close:'15:00'}], sun: [] }. A close earlier than
// its open means the range crosses midnight (checked from the PREVIOUS day too).
export function isOpenNow(hours: Hours, now: Date = new Date()): boolean {
  if (!hours) return false;
  const day = now.getDay();
  const t = now.getHours() * 60 + now.getMinutes();

  const today = hours[DAYS[day]] ?? [];
  for (const r of today) {
    const o = mins(r.open), c = mins(r.close);
    if (c > o ? t >= o && t < c : t >= o) return true; // overnight: open till midnight
  }
  const yesterday = hours[DAYS[(day + 6) % 7]] ?? [];
  for (const r of yesterday) {
    const o = mins(r.open), c = mins(r.close);
    if (c < o && t < c) return true;                   // yesterday's overnight tail
  }
  return false;
}
