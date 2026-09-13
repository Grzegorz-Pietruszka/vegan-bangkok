import type { PlaceSearchIntent } from '@vegan-bangkok/schemas';
import { RANK_WEIGHTS, type RankWeights } from './constants.ts';

export type RankCandidate = {
  id: string; rrf: number; distanceM: number | null; lovedCount: number; vibeTags: string[];
};

function weightsFor(intent: PlaceSearchIntent): RankWeights {
  if (intent.mode === 'hidden_gems') return RANK_WEIGHTS.hidden_gems;
  if (intent.mode === 'popular') return RANK_WEIGHTS.best;
  return RANK_WEIGHTS[intent.intentType];
}

export function rankPlaces(
  cands: RankCandidate[], intent: PlaceSearchIntent, radiusM: number,
): { id: string; score: number }[] {
  if (cands.length === 0) return [];
  const w = weightsFor(intent);
  const maxRrf = Math.max(...cands.map((c) => c.rrf)) || 1;
  const maxLoved = Math.max(...cands.map((c) => c.lovedCount));
  const prefs = new Set(intent.softPreferences);
  return cands.map((c) => {
    const relevance = c.rrf / maxRrf;
    const distance = c.distanceM == null ? 0 : 1 - Math.min(c.distanceM / radiusM, 1);
    const popularity = maxLoved === 0 ? 0 : Math.log1p(c.lovedCount) / Math.log1p(maxLoved);
    const vibe = prefs.size === 0 ? 0 : c.vibeTags.filter((t) => prefs.has(t)).length / prefs.size;
    return {
      id: c.id,
      score: w.relevance * relevance + w.distance * distance + w.popularity * popularity + w.vibe * vibe,
    };
  }).sort((a, b) => b.score - a.score);
}
