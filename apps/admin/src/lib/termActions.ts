'use server';
// Server actions for the term-mining page. Lives apart from terms.ts because a
// 'use server' module may only export async functions (terms.ts exports the sync
// rankUnknownTerms + its type, and node --test imports it directly).
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dishes, ingredients, ingredientAliases, tags } from '@vegan-bangkok/db/schema';
import { tokenizeLines } from '@/lib/tokenize';
import { rankUnknownTerms, type RankedTerm } from '@/lib/terms';
import { normalizeName } from '../../../api/src/search/normalize.ts';
// exportBundle lives in the db package (not the api script) — see the header of
// packages/db/src/export-bundle.ts for the two Turbopack findings behind the move.
import { exportBundle } from '@vegan-bangkok/db/export-bundle';
import { revalidatePath } from 'next/cache';

async function knownTerms(): Promise<Set<string>> {
  const { rows } = await db.execute(sql`
    SELECT name_th AS t FROM dishes WHERE name_th IS NOT NULL
    UNION SELECT alias_normalized FROM dish_aliases
    UNION SELECT alias_normalized FROM ingredient_aliases
    UNION SELECT normalized FROM tags`);
  const set = new Set<string>();
  for (const r of rows as { t: string }[]) if (r.t) set.add(normalizeName(r.t));
  return set;
}

export async function runMining(): Promise<RankedTerm[]> {
  const { rows } = await db.execute(sql`SELECT raw_text FROM menu_scan_misses`);
  const lines = (rows as { raw_text: string }[]).map((r) => r.raw_text);
  const tokens = await tokenizeLines(lines);
  return rankUnknownTerms(tokens, await knownTerms(), normalizeName);
}

export async function approveTerm(term: string, target: 'dish' | 'ingredient' | 'alias' | 'tag', extra: FormData): Promise<{ error?: string }> {
  const en = String(extra.get('nameEn') ?? '').trim();
  try {
    if (target === 'dish') {
      await db.insert(dishes).values({ nameEn: en || term, nameTh: term });
    } else if (target === 'ingredient') {
      const risk = String(extra.get('veganRiskClass') ?? 'conditional_review');
      // The scan dictionary is ingredient_aliases JOIN ingredients, and knownTerms() above
      // reads only name_th/alias tables — an ingredient row without an alias row is invisible
      // to scans AND reappears as unknown on the next mining run. Write both, atomically.
      await db.transaction(async (tx) => {
        const [ing] = await tx.insert(ingredients)
          .values({ nameEn: en || term, nameTh: term, veganRiskClass: risk })
          .returning({ id: ingredients.id });
        await tx.insert(ingredientAliases)
          .values({ ingredientId: ing.id, aliasText: term, aliasNormalized: normalizeName(term), language: 'th' });
      });
    } else if (target === 'tag') {
      const facet = String(extra.get('facet') ?? '').trim();
      if (!facet) return { error: 'Pick a facet for the tag.' };
      // The mined Thai token is the name_th; normalized is its match key so it stops resurfacing.
      await db.insert(tags).values({ facet, nameEn: en || term, nameTh: term, normalized: normalizeName(term) });
    } else {
      const ingredientId = String(extra.get('ingredientId') ?? '').trim();
      if (!ingredientId) return { error: 'Alias needs the ingredient UUID it belongs to — copy it from the ingredients table.' };
      await db.insert(ingredientAliases).values({ ingredientId, aliasText: term, aliasNormalized: normalizeName(term), language: 'th' });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'approve failed';
    // drizzle 0.45 wraps pg errors in DrizzleQueryError; the pg detail lives on .cause.
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : '';
    return { error: cause || msg };
  }
  revalidatePath('/terms');
  return {};
}

export async function reexportBundle(): Promise<{ ok: true }> {
  await exportBundle();
  return { ok: true };
}
