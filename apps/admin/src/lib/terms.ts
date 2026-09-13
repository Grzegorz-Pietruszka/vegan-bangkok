export type RankedTerm = { term: string; freq: number };

// Unknown-term miner: tokens not already in `known`, ranked by how often they appear across
// all miss lines. Single-char tokens are OCR/segmentation noise and dropped. `normalize` is
// the same function used when the known set was built, so comparison is apples-to-apples.
export function rankUnknownTerms(
  tokensPerLine: string[][], known: Set<string>, normalize: (s: string) => string,
): RankedTerm[] {
  const freq = new Map<string, number>();
  for (const line of tokensPerLine) {
    for (const raw of line) {
      const term = normalize(raw);
      if (term.length < 2) continue;
      if (known.has(term)) continue;
      freq.set(term, (freq.get(term) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .map(([term, f]) => ({ term, freq: f }))
    .sort((a, b) => b.freq - a.freq || a.term.localeCompare(b.term));
}
