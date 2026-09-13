import { EXCLUSION_PHRASES } from './thaiPhrases';

type CoachDish = {
  nameEn: string;
  nameTh: string | null;
  orderPhrase: string | null;
  skipIngredients: string | null;
};

export type CoachLine = { thai: string | null; english: string };
export type Coach = { say: { roman: string } | null; avoid: CoachLine[] };

// Builds the ordering-coach content for a dish. Thai comes ONLY from the curated
// phrase table — an unmapped ingredient degrades to English, never invented Thai.
export function coachLines(dish: CoachDish): Coach {
  const say = dish.orderPhrase ? { roman: dish.orderPhrase } : null;
  const avoid = (dish.skipIngredients ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((ing) => ({ thai: EXCLUSION_PHRASES[ing] ?? null, english: `no ${ing}` }));
  return { say, avoid };
}
