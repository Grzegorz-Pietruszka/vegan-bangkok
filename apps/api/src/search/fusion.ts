import { RRF_K } from './constants.ts';

export type ScoredId = { id: string; score: number };

// Reciprocal Rank Fusion (Cormack et al.): rank-based, so arms with incomparable
// score scales (ts_rank vs cosine vs metres) fuse without normalization.
export function rrfFuse(arms: ScoredId[][], k = RRF_K): ScoredId[] {
  const acc = new Map<string, number>();
  for (const arm of arms) {
    arm.forEach(({ id }, i) => acc.set(id, (acc.get(id) ?? 0) + 1 / (k + i + 1)));
  }
  return [...acc].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}
