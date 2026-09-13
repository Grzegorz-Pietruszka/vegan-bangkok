export type LatLng = { lat: number; lng: number };

// v1 = straight-line Haversine by decision (plan 10). Swap in a Google Routes
// computeRouteMatrix provider behind this seam when straight-line mis-orders
// (Bangkok canals) — one-file change, future stretch.
export interface RouteMatrixProvider {
  distanceM(a: LatLng, b: LatLng): number;
}

const EARTH_R = 6_371_000;

export function haversineM(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

export const HaversineProvider: RouteMatrixProvider = { distanceM: haversineM };

export type MatrixCandidate = LatLng & { vibeScore?: number };  // 0..1, from the shortlist
export type MatrixWeights = { vibeBonusM: number };

// Tunable consts, not config: nobody sets these at runtime.
export const DEFAULT_WEIGHTS: MatrixWeights = { vibeBonusM: 300 };

// cost[i][j] = walking i→j: distance minus a bonus making high-vibe DESTINATIONS
// cheaper to reach (cost is asymmetric; raw distance stays symmetric). Self cell is
// Infinity — also covers revisits, since the solver never re-enters a visited node.
export function buildCostMatrix(
  cands: MatrixCandidate[],
  provider: RouteMatrixProvider = HaversineProvider,
  w: MatrixWeights = DEFAULT_WEIGHTS,
): number[][] {
  return cands.map((a, i) => cands.map((b, j) =>
    i === j ? Infinity : provider.distanceM(a, b) - (b.vibeScore ?? 0) * w.vibeBonusM,
  ));
}
