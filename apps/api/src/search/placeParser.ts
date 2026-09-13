// Deterministic query → PlaceSearchIntent parser (spec §2). Pure, sync, no DB:
// entity knowledge arrives pre-resolved via opts.knownEntities (route calls
// findEntityMatches first), so the parser stays trivially table-testable.
import type { PlaceSearchIntent, PlaceIntentType } from '@vegan-bangkok/schemas';
import { normalizeName } from './normalize.ts';
import { matchDistrict, INTENT_PATTERNS, VENUE_WORDS, CHEAP_PRICE_MAX, CONFIDENCE_THRESHOLD } from './constants.ts';
import { VIBE_VOCAB } from '../enrich/vibeVocab.ts';
import { classifyIntent } from './slmClassifier.ts';

const STOP_WORDS = new Set(
  ['in', 'a', 'an', 'the', 'for', 'me', 'some', 'vegan', 'food', 'place', 'places', 'eats', 'to', 'eat']
    .map(normalizeName),
);
const VIBE_BY_NORM = new Map(VIBE_VOCAB.map((v) => [normalizeName(v), v as string]));

export function parsePlaceQuery(
  q: string,
  opts: { hasUserLoc?: boolean; knownEntities?: string[] } = {},
): PlaceSearchIntent {
  const raw = q.toLowerCase().trim();
  let isBestQuery = false, openNow = false;
  let mode: PlaceSearchIntent['mode'] = null;
  let priceMax: number | null = null;
  let patternIntent: PlaceIntentType | null = null;
  let rest = raw, semanticQuery = raw;

  // 1. phrase patterns on the raw string; matched spans removed from `rest` (token accounting)
  //    and from `semanticQuery` (intent words don't help the vector arm).
  const consume = (re: RegExp, apply: () => void) => {
    if (re.test(rest)) {
      apply();
      rest = rest.replace(re, ' ');
      semanticQuery = semanticQuery.replace(re, ' ');
    }
  };
  consume(INTENT_PATTERNS.planning, () => { patternIntent = 'planning'; });
  consume(INTENT_PATTERNS.hiddenGems, () => { mode = 'hidden_gems'; });
  consume(INTENT_PATTERNS.popular, () => { mode = 'popular'; });
  consume(INTENT_PATTERNS.best, () => { isBestQuery = true; patternIntent ??= 'best'; });
  consume(INTENT_PATTERNS.nearby, () => { if (opts.hasUserLoc) patternIntent ??= 'nearby'; });
  consume(INTENT_PATTERNS.cheap, () => { priceMax = CHEAP_PRICE_MAX; });
  consume(INTENT_PATTERNS.openNow, () => { openNow = true; });

  // 2. token / n-gram resolution over what's left
  const totalTokens = raw.split(/\s+/).filter(Boolean).length || 1;
  const tokens = rest.split(/\s+/).filter(Boolean);
  const entityNorms = new Map((opts.knownEntities ?? []).map((e) => [normalizeName(e), e]));
  const entities: string[] = [], softPreferences: string[] = [];
  let primaryLocation: string | null = null;
  let consumed = totalTokens - tokens.length; // tokens eaten by phrase patterns

  let i = 0;
  while (i < tokens.length) {
    let matched = 0;
    for (const len of [3, 2, 1]) {                     // longest n-gram first
      if (i + len > tokens.length) continue;
      const gramRaw = tokens.slice(i, i + len).join(' ');
      const gram = normalizeName(gramRaw);
      const district = matchDistrict(gram);
      if (district) { primaryLocation ??= district.canonical; matched = len; break; }
      if (entityNorms.has(gram)) { entities.push(entityNorms.get(gram)!); matched = len; break; }
      if (len === 1 && VIBE_BY_NORM.has(gram)) { softPreferences.push(VIBE_BY_NORM.get(gram)!); matched = 1; break; }
      if (len === 1 && VENUE_WORDS.includes(gram)) { entities.push(gramRaw); matched = 1; break; }
      if (len === 1 && (STOP_WORDS.has(gram) || gram === '')) { matched = 1; break; }
    }
    consumed += matched;
    i += matched || 1;
  }

  // 3. intent resolution order (spec §2): planning > best > nearby > entity > discovery
  const intentType: PlaceIntentType =
    patternIntent ?? (mode == null && entities.length > 0 ? 'entity' : 'discovery');

  return {
    intentType, entities, primaryLocation, isBestQuery, mode,
    hardFilters: { vegan: true, openNow, priceMax, exclude: [] },
    softPreferences,
    semanticQuery: semanticQuery.replace(/\s+/g, ' ').trim() || raw,
    confidence: Math.min(consumed / totalTokens, 1),
  };
}

// Slice-2: zero-shot classification for low-confidence queries only. May overwrite
// intentType + mode and NOTHING else; SlmNotReadyError/SlmError propagate to the route.
export async function classifyIntentSLM(
  q: string,
  draft: PlaceSearchIntent,
  opts: { hasUserLoc?: boolean } = {},
): Promise<PlaceSearchIntent> {
  if (draft.confidence >= CONFIDENCE_THRESHOLD) return draft;
  const { intentType, mode } = await classifyIntent(q);
  const finalType = intentType === 'nearby' && !opts.hasUserLoc ? 'discovery' : intentType;
  return { ...draft, intentType: finalType, mode };
}
