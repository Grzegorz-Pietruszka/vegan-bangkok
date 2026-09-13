import type { BundledDish } from '@/data/dishes.seed';

// Tonight's Pick: prefer team-verified dishes, rotate deterministically by day-of-year
// so the hero changes daily without randomness (no Math.random — stable per date).
export function pickTonightsDish(dishes: BundledDish[], date: Date): BundledDish | null {
  if (dishes.length === 0) return null;
  const verified = dishes.filter((d) => d.places.some((p) => p.verifiedVegan));
  const pool = verified.length > 0 ? verified : dishes;
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86_400_000);
  return pool[dayOfYear % pool.length];
}
