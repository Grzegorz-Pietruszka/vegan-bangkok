import { sql, type SQL } from 'drizzle-orm';

// Canonical full-name form for the Tier-1 gate: lowercase FIRST, then strip everything that
// isn't a-z, 0-9, or Thai ก-๛ (U+0E01–U+0E5B — includes vowel signs and tone marks, which
// \p{L}\p{N} would drop; that's why the class is explicit, not Unicode properties).
// "Pad Thai" / "pad thai" / "pad-thai" → "padthai"; "ส้มตำ" → "ส้มตำ".
//
// PARITY INVARIANT: normalizeName (JS) and sqlNormName (SQL) must stay byte-for-byte
// equivalent, and the functional indexes in the search_hybrid migration must use sqlNormName's
// exact spelling or the planner can't use them. test/normalize.test.ts asserts JS↔SQL parity
// over the whole corpus THROUGH sqlNormName, and test/migrate.test.ts asserts the live
// indexdef contains the same expression.
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9ก-๛]/g, '');
}

// The same normalization as a SQL fragment — every query-side use goes through this,
// so there is exactly one SQL spelling in the codebase.
export function sqlNormName(col: SQL): SQL {
  return sql`regexp_replace(lower(${col}), '[^a-z0-9ก-๛]', '', 'g')`;
}
