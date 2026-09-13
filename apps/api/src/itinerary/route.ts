// TSP-ish ordering (plan 10, v1 EASY tier): fixed start, must-include stops, coarse
// slot monotonicity (course / time-of-day ranks must never decrease along the walk).
// Exact Held-Karp for small n, greedy + 2-opt above it. Path, not a cycle — nobody
// walks back to where they started a food crawl.

export type OrderOpts = {
  startIdx: number;
  mustInclude?: number[];
  slotRanks?: (number | null)[];   // per matrix index; null = unconstrained
  maxStops: number;                // stops beyond the start
};

const HELD_KARP_MAX = 12;

export function orderRoute(matrix: number[][], opts: OrderOpts): number[] {
  const n = matrix.length;
  const { startIdx, maxStops } = opts;
  const slot = opts.slotRanks ?? new Array<number | null>(n).fill(null);
  const must = [...new Set((opts.mustInclude ?? []).filter((i) => i !== startIdx))];
  const others = [...Array(n).keys()].filter((i) => i !== startIdx);
  const target = Math.min(maxStops, others.length);
  if (must.length > target) {
    throw new Error(`mustInclude (${must.length}) exceeds maxStops (${target})`);
  }
  if (target === 0) return [startIdx];
  return others.length <= HELD_KARP_MAX
    ? heldKarp(matrix, startIdx, others, must, slot, target)
    : greedyTwoOpt(matrix, startIdx, others, must, slot, target);
}

// Exact DP over subsets. State: (visited mask, last node, max slot rank seen).
// Rank state is what lets slot monotonicity survive subset enumeration: extending to k
// is legal iff slot[k] is null or ≥ the path's max rank so far.
function heldKarp(
  matrix: number[][], start: number, others: number[],
  must: number[], slot: (number | null)[], target: number,
): number[] {
  const m = others.length;
  const ranks = [...new Set(slot.filter((r): r is number => r !== null))].sort((a, b) => a - b);
  const rankId = new Map<number, number>(ranks.map((r, i) => [r, i + 1])); // 0 = none seen
  const R = ranks.length + 1;
  const rk = (i: number) => (slot[others[i]] === null ? null : rankId.get(slot[others[i]]!)!);

  const size = (1 << m) * m * R;
  const cost = new Float64Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const key = (mask: number, e: number, r: number) => (mask * m + e) * R + r;

  for (let i = 0; i < m; i++) {
    const r = rk(i) ?? 0;
    cost[key(1 << i, i, r)] = matrix[start][others[i]];
  }

  const mustMask = must.reduce((acc, node) => acc | (1 << others.indexOf(node)), 0);
  let best = Infinity; let bestKey = -1;

  for (let mask = 1; mask < 1 << m; mask++) {
    const popcount = countBits(mask);
    if (popcount > target) continue;
    for (let e = 0; e < m; e++) {
      if (!(mask & (1 << e))) continue;
      for (let r = 0; r < R; r++) {
        const c = cost[key(mask, e, r)];
        if (c === Infinity) continue;
        if (popcount === target && (mask & mustMask) === mustMask && c < best) {
          best = c; bestKey = key(mask, e, r);
        }
        if (popcount === target) continue;
        for (let k = 0; k < m; k++) {
          if (mask & (1 << k)) continue;
          const kr = rk(k);
          if (kr !== null && kr < r) continue;           // slot rank may never decrease
          const nr = kr === null ? r : Math.max(r, kr);
          const nk = key(mask | (1 << k), k, nr);
          const nc = c + matrix[others[e]][others[k]];
          if (nc < cost[nk]) { cost[nk] = nc; parent[nk] = key(mask, e, r); }
        }
      }
    }
  }

  if (bestKey === -1) throw new Error('no feasible route (slot constraints unsatisfiable)');
  const path: number[] = [];
  for (let k = bestKey; k !== -1; k = parent[k]) {
    path.push(others[Math.floor(k / R) % m]);
  }
  return [start, ...path.reverse()];
}

function countBits(x: number): number {
  let c = 0;
  for (let v = x; v; v &= v - 1) c++;
  return c;
}

// ponytail: greedy selection + slot-aware nearest neighbor + one bounded 2-opt pass.
// Exact enough for "walkable stops near me"; upgrade path is raising HELD_KARP_MAX
// or a real solver if routes ever exceed ~20 candidates AND quality complaints appear.
function greedyTwoOpt(
  matrix: number[][], start: number, others: number[],
  must: number[], slot: (number | null)[], target: number,
): number[] {
  // selection: must-includes, then nearest remaining to any selected node
  const selected = new Set<number>(must);
  while (selected.size < target) {
    let bestNode = -1; let bestD = Infinity;
    for (const cand of others) {
      if (selected.has(cand)) continue;
      const from = [start, ...selected];
      const d = Math.min(...from.map((f) => matrix[f][cand]));
      if (d < bestD) { bestD = d; bestNode = cand; }
    }
    selected.add(bestNode);
  }

  // order: nearest FEASIBLE neighbor — feasible = unslotted, or carrying the minimum
  // outstanding rank (so a high-rank pick can never strand a lower-rank stop)
  const remaining = new Set(selected);
  const path = [start];
  while (remaining.size > 0) {
    const outstanding = [...remaining].map((i) => slot[i]).filter((r): r is number => r !== null);
    const minRank = outstanding.length ? Math.min(...outstanding) : null;
    const here = path[path.length - 1];
    let bestNode = -1; let bestD = Infinity;
    for (const cand of remaining) {
      if (slot[cand] !== null && slot[cand] !== minRank) continue;
      if (matrix[here][cand] < bestD) { bestD = matrix[here][cand]; bestNode = cand; }
    }
    path.push(bestNode);
    remaining.delete(bestNode);
  }

  // one 2-opt pass: reverse improving segments that keep slot order monotonic
  const monotonic = (p: number[]) => {
    let r = -Infinity;
    for (const i of p.slice(1)) {
      const s = slot[i];
      if (s !== null) { if (s < r) return false; r = s; }
    }
    return true;
  };
  const pathCost = (p: number[]) => p.slice(1).reduce((acc, node, i) => acc + matrix[p[i]][node], 0);
  for (let i = 1; i < path.length - 1; i++) {
    for (let j = i + 1; j < path.length; j++) {
      const flipped = [...path.slice(0, i), ...path.slice(i, j + 1).reverse(), ...path.slice(j + 1)];
      if (monotonic(flipped) && pathCost(flipped) < pathCost(path)) path.splice(0, path.length, ...flipped);
    }
  }
  return path;
}
