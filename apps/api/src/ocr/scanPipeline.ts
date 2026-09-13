import { sql } from 'drizzle-orm';
import type { MenuScanItem, IngredientFlag as ScanFlag } from '@vegan-bangkok/schemas';
import { db as defaultDb, type DB } from '../db/index.ts';
import { menuScanMisses } from '../db/schema.ts';
import { normalizeName } from '../search/normalize.ts';
import { searchByName, searchByAlias, searchByVector } from '../search/dishSearch.ts';
import { getCachedEmbedding, putCachedEmbedding } from '../search/embeddingCache.ts';
import { MODEL } from '../embed/gemini.ts';
import { findIngredientFlags, type IngredientDictEntry } from './ingredientMatch.ts';
import { NullTranslationProvider, type TranslationProvider } from './translationProvider.ts';

// Scan pipeline (plan 11, Task 4): OCR lines → database-first matching → visual-menu items.
// Tier order PER LINE, deliberately stricter than the search route's:
//   1. deterministic dish match (name, then alias) — WINS over raw ingredient hits, because
//      jay menus name mock meats with animal words (หมู/ไก่/ปลา/น้ำมันหอย); hits are still
//      SURFACED on the matched item, never silently dropped.
//   2. ingredient flags — an explicit hard-block word short-circuits the semantic tier: a
//      fuzzy vector match may never talk over "this line says oyster sauce".
//   3. semantic vector, threshold-gated — cosine sim below the gate is an honest unmatched,
//      not a guess (the plan's "low confidence → don't guess" rule).
//   4. unmatched → TranslationProvider (Null in v1) + menu_scan_misses curation log.

export type OcrLineIn = { text: string; confidence: number };

export type ScanDeps = {
  embedFn?: (texts: string[]) => Promise<number[][]>;   // absent → semantic tier skipped
  translationProvider?: TranslationProvider;
  db?: DB;
};

// Below this cosine similarity a semantic hit is a guess, not a match. Calibrated against
// the plan-08 eval corpus; re-checked at the Task 8 live gate with real menu photos.
export const SEMANTIC_MATCH_THRESHOLD = 0.8;
// OCR confidence (0–100) below which an item is marked lowConfidence — still processed.
export const LOW_CONFIDENCE = 60;
// Lines whose normalized form has fewer letters are OCR noise (prices, stray glyphs):
// dropped entirely so they can't pollute menu_scan_misses.
const MIN_LETTERS = 3;

const THAI_RUN = /[ก-๛]+/g;
const LATIN_RUN = /[a-zA-Z][a-zA-Z .'-]*[a-zA-Z]|[a-zA-Z]/g;

// Menu lines mix scripts and prices ("ผัดซีอิ๊ว Pad See Ew 60.-"), so whole-line equality
// can never fire. Candidates for the deterministic tiers: joined Thai runs, joined Latin
// runs, each individual run — plus เจ-stripped variants (jay menus suffix dish names with
// เจ: ข้าวซอยเจ is Khao soi).
export function matchCandidates(rawLine: string): string[] {
  const thaiRuns = rawLine.match(THAI_RUN) ?? [];
  const latinRuns = (rawLine.match(LATIN_RUN) ?? []).filter((r) => r.length > 1);
  const parts = [thaiRuns.join(''), latinRuns.join(' '), ...thaiRuns, ...latinRuns];
  const out: string[] = [];
  for (const p of parts) {
    const norm = normalizeName(p);
    if (norm.length < MIN_LETTERS) continue;
    for (const cand of norm.endsWith('เจ') ? [norm, norm.slice(0, -2)] : [norm]) {
      if (cand.length >= MIN_LETTERS && !out.includes(cand)) out.push(cand);
    }
  }
  return out;
}

function letterCount(s: string): number {
  return (s.match(/[a-zก-๛]/g) ?? []).length;
}

export async function loadIngredientDict(db: DB = defaultDb): Promise<IngredientDictEntry[]> {
  const { rows } = await db.execute(sql`
    SELECT i.id AS "ingredientId", i.name_en AS "nameEn", i.name_th AS "nameTh",
           i.vegan_risk_class AS "veganRiskClass", a.alias_text AS "aliasText",
           a.alias_normalized AS "aliasNormalized"
    FROM ingredient_aliases a JOIN ingredients i ON i.id = a.ingredient_id`);
  return rows as unknown as IngredientDictEntry[];
}

const toScanFlag = ({ nameEn, nameTh, veganRiskClass, matchedAlias }: ReturnType<typeof findIngredientFlags>[number]): ScanFlag =>
  ({ nameEn, nameTh, veganRiskClass, matchedAlias });

export async function scanMenu(lines: OcrLineIn[], deps: ScanDeps = {}): Promise<MenuScanItem[]> {
  const db = deps.db ?? defaultDb;
  const dict = await loadIngredientDict(db);
  const items: MenuScanItem[] = [];

  for (const l of lines) {
    const rawText = l.text.trim();
    const norm = normalizeName(rawText);
    if (letterCount(norm) < MIN_LETTERS) continue;   // pure OCR noise

    const base = {
      rawText,
      ocrConfidence: l.confidence,
      lowConfidence: l.confidence < LOW_CONFIDENCE,
    };
    const flags = findIngredientFlags(norm, dict).map(toScanFlag);

    // 1. deterministic dish tiers over the script-segment candidates
    let matched: { dish: Awaited<ReturnType<typeof searchByName>>[number]; via: 'name' | 'alias' } | null = null;
    for (const tier of [
      { via: 'name' as const, search: searchByName },
      { via: 'alias' as const, search: searchByAlias },
    ]) {
      for (const cand of matchCandidates(rawText)) {
        const [dish] = await tier.search(cand);
        if (dish) { matched = { dish, via: tier.via }; break; }
      }
      if (matched) break;
    }
    if (matched) {
      items.push({ ...base, type: 'matched', matchedVia: matched.via, dish: matched.dish, ingredientFlags: flags });
      continue;
    }

    // 2. explicit ingredient hit — semantic is never consulted
    if (flags.length > 0) {
      items.push({ ...base, type: 'ingredient_flagged', ingredientFlags: flags,
        translation: await translate(deps, rawText) });
      continue;
    }

    // 3. semantic, threshold-gated (query-embedding cache keeps repeat scans free)
    if (deps.embedFn) {
      try {
        let vecQ = await getCachedEmbedding(rawText, MODEL);
        if (!vecQ) {
          [vecQ] = await deps.embedFn([rawText]);
          await putCachedEmbedding(rawText, MODEL, vecQ);
        }
        const [best] = await searchByVector(vecQ, { limit: 1 });
        if (best && best.score >= SEMANTIC_MATCH_THRESHOLD) {
          items.push({ ...base, type: 'matched', matchedVia: 'semantic', dish: best, ingredientFlags: flags });
          continue;
        }
      } catch {
        // embedder down → fall through to unmatched; a scan must never 5xx on Gemini
      }
    }

    // 4. honest unmatched: translate (null in v1) + log the curation lead
    items.push({ ...base, type: 'unmatched', translation: await translate(deps, rawText) });
    await db.insert(menuScanMisses).values({ rawText, ocrConfidence: l.confidence });
  }
  return items;
}

const defaultTranslation = new NullTranslationProvider();

async function translate(deps: ScanDeps, text: string): Promise<string | null> {
  const provider = deps.translationProvider ?? defaultTranslation;
  try {
    return await provider.translate(text);
  } catch {
    return null;   // translation is best-effort garnish, never a failure source
  }
}
