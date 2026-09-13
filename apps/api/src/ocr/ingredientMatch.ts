// Ingredient substring matcher (plan 11, Task 2). Pure: the caller supplies the dictionary
// (ingredient_aliases ⋈ ingredients) and an ALREADY-normalized line — normalization happens
// exactly once, via the existing normalizeName, on both sides (aliases at write time, lines
// at scan time). No second normalizer.
//
// ponytail: bare substring semantics — no Thai word segmentation, so นม (milk) also hits
// inside ขนม* (dessert) words and "egg" hits "eggplant". PyThaiNLP-style tokenization is the
// documented upgrade, gated in brainstorming/tech-adoption-guide.md behind a MEASURED
// matching-quality problem; log gate results before reaching for it.

// Mirrors the ingredients.vegan_risk_class check constraint — as const union, no TS enum.
export const VEGAN_RISK_CLASSES = ['hard_block', 'conditional_review', 'safe'] as const;
export type VeganRiskClass = (typeof VEGAN_RISK_CLASSES)[number];

export type IngredientDictEntry = {
  ingredientId: string;
  nameEn: string;
  nameTh: string | null;
  veganRiskClass: VeganRiskClass;
  aliasText: string;        // display form
  aliasNormalized: string;  // normalizeName(aliasText), stored in ingredient_aliases
};

export type IngredientFlag = {
  ingredientId: string;
  nameEn: string;
  nameTh: string | null;
  veganRiskClass: VeganRiskClass;
  matchedAlias: string;     // the display-form alias that hit, for the warning card
};

export function findIngredientFlags(
  normalizedLine: string,
  dict: IngredientDictEntry[],
): IngredientFlag[] {
  if (!normalizedLine) return [];
  // Longest alias first + span consumption: หอย ⊂ น้ำมันหอย and ปลา ⊂ น้ำปลา — when the
  // longer (more specific) term matches, its characters are consumed so the shorter term
  // only flags where it occurs INDEPENDENTLY elsewhere in the line.
  const ordered = [...dict].sort((a, b) => b.aliasNormalized.length - a.aliasNormalized.length);
  let remaining = normalizedLine;
  const byIngredient = new Map<string, IngredientFlag>(); // one flag per ingredient
  for (const e of ordered) {
    if (!e.aliasNormalized) continue;
    if (remaining.includes(e.aliasNormalized)) {
      remaining = remaining.replaceAll(e.aliasNormalized, '·');   // '·' never matches: not in [a-z0-9ก-๛]
      if (!byIngredient.has(e.ingredientId)) {
        byIngredient.set(e.ingredientId, {
          ingredientId: e.ingredientId, nameEn: e.nameEn, nameTh: e.nameTh,
          veganRiskClass: e.veganRiskClass, matchedAlias: e.aliasText,
        });
      }
    }
  }
  return [...byIngredient.values()];
}
