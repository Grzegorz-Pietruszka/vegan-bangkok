import type { RouteStep } from '@vegan-bangkok/schemas';

const WALK_KMH = 4;
const EAT_HOURS = 0.75;   // display heuristic only — not a promise

export function tourMeta(steps: RouteStep[]): { stops: number; km: number; hours: number } {
  const km = steps.reduce((acc, s) => acc + (s.walkMetersFromPrev ?? 0), 0) / 1000;
  const foodStops = steps.filter((s) => s.type !== 'site').length;
  return { stops: steps.length, km, hours: km / WALK_KMH + foodStops * EAT_HOURS };
}

export function formatTourMeta(steps: RouteStep[]): string {
  const m = tourMeta(steps);
  const h = (Math.round(m.hours * 2) / 2).toString().replace(/\.0$/, '');
  return `${m.stops} stops · ${m.km.toFixed(1)} km · ~${h} h`;
}
