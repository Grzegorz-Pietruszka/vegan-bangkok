import type { CanonicalPlace } from './adapters/types.ts';

// Multi-source merge seam. One real source today (google_places); OSM/HappyCow/OCR
// slot in by adding their adapter + a priority entry. Unknown sources rank last.
export const SOURCE_PRIORITY = ['google_places', 'osm', 'happycow'] as const;

const rank = (source: string) => {
  const i = (SOURCE_PRIORITY as readonly string[]).indexOf(source);
  return i === -1 ? SOURCE_PRIORITY.length : i;
};

// Field-wise: the highest-priority non-null value wins; lower priorities fill gaps.
export function mergeCanonical(inputs: CanonicalPlace[]): CanonicalPlace {
  if (inputs.length === 0) throw new Error('mergeCanonical: empty input');
  const ids = new Set(inputs.map((i) => i.googlePlaceId));
  if (ids.size > 1) throw new Error(`mergeCanonical: mixed googlePlaceId (${[...ids].join(', ')})`);

  const ordered = [...inputs].sort((a, b) => rank(a.source) - rank(b.source));
  const merged = { ...ordered[0] };
  for (const next of ordered.slice(1)) {
    for (const [k, v] of Object.entries(next) as [keyof CanonicalPlace, never][]) {
      if (merged[k] == null || (Array.isArray(merged[k]) && merged[k].length === 0)) merged[k] = v;
    }
  }
  return merged;
}
