import type { BundledDish } from '@/data/dishes.seed';

export type DishFilter = { q?: string; tag?: string; region?: string };

// Offline/fallback search over the bundled catalog — substring across names,
// description and tags. The ranked semantic search is the API (`searchDishes`).
export function filterDishes(dishes: BundledDish[], f: DishFilter): BundledDish[] {
  const q = f.q?.trim().toLowerCase();
  return dishes.filter((d) => {
    if (f.tag && !(d.tags ?? []).includes(f.tag)) return false;
    if (f.region && d.regionName !== f.region) return false;
    if (!q) return true;
    const hay = [d.nameEn, d.nameTh ?? '', d.description ?? '', ...(d.tags ?? [])]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}
