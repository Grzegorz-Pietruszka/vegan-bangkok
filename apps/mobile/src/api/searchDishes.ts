import { searchResponse, type DishResult, type MatchType } from '@vegan-bangkok/schemas';
import { API_BASE, HttpError } from './base';

// First M4 seam: ranked semantic search from the API (now three-tier: name → vector → full-text).
// Throws on ANY failure (timeout, non-200, schema mismatch) — the Discovery screen falls back to
// the local bundle filter, so search always answers.
export async function searchDishes(q: string, limit = 20): Promise<{ results: DishResult[]; matchType?: MatchType }> {
  const res = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, limit }),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new HttpError(res.status);
  const parsed = searchResponse.parse(await res.json());
  return { results: parsed.results, matchType: parsed.matchType };
}
