import type { DB } from '../src/db/index.ts';
import { tags, dishTags, dishes } from '../src/db/schema.ts';
import { normalizeName } from '../src/search/normalize.ts';
import data from './data.json' with { type: 'json' };

// Facet for every tag string currently present in data.json's dishes. Migrated from the
// flat dishes.tags bag; best-effort where a term is ambiguous (curatable later via the admin).
// A data.json tag missing here throws in seedTags — new tags must get an explicit facet.
export const FACET_MAP: Record<string, 'flavor' | 'cooking_method' | 'form' | 'ingredient_type' | 'course'> = {
  // flavor / sensory
  sour: 'flavor', sweet: 'flavor', spicy: 'flavor', mild: 'flavor',
  creamy: 'flavor', light: 'flavor', crispy: 'flavor',
  // cooking_method
  fried: 'cooking_method', grilled: 'cooking_method', 'stir fry': 'cooking_method',
  // form
  curry: 'form', 'green curry': 'form', 'red curry': 'form', 'yellow curry': 'form',
  massaman: 'form', panang: 'form', soup: 'form', 'clear broth': 'form', salad: 'form',
  noodles: 'form', 'wide noodles': 'form', 'glass noodles': 'form', rice: 'form',
  'fried rice': 'form', 'sticky rice': 'form', skewers: 'form', northern: 'form',
  // ingredient_type
  bamboo: 'ingredient_type', cashew: 'ingredient_type', chili: 'ingredient_type',
  'chili paste': 'ingredient_type', 'chinese broccoli': 'ingredient_type', coconut: 'ingredient_type',
  'curry paste': 'ingredient_type', galangal: 'ingredient_type', garlic: 'ingredient_type',
  gravy: 'ingredient_type', 'green beans': 'ingredient_type', herbs: 'ingredient_type',
  'holy basil': 'ingredient_type', lemongrass: 'ingredient_type', mango: 'ingredient_type',
  'morning glory': 'ingredient_type', mushroom: 'ingredient_type', papaya: 'ingredient_type',
  peanut: 'ingredient_type', 'peanut sauce': 'ingredient_type', pineapple: 'ingredient_type',
  potato: 'ingredient_type', 'soy protein': 'ingredient_type', 'soy sauce': 'ingredient_type',
  tamarind: 'ingredient_type', tofu: 'ingredient_type', turmeric: 'ingredient_type',
  vegetables: 'ingredient_type',
  // course
  dessert: 'course', starter: 'course',
};

type SeedDish = { nameEn: string; tags?: string[] };

export async function seedTags(db: DB): Promise<{ vocab: number; links: number }> {
  const dishesData = (data as { dishes: SeedDish[] }).dishes;
  const distinct = [...new Set(dishesData.flatMap((d) => d.tags ?? []))];

  // Upsert vocabulary by normalized (idempotent). Fail loud on an unmapped tag.
  const idByNorm = new Map<string, string>();
  for (const name of distinct) {
    const facet = FACET_MAP[name];
    if (!facet) throw new Error(`no facet mapped for tag "${name}" — add it to FACET_MAP`);
    const norm = normalizeName(name);
    const [row] = await db.insert(tags)
      .values({ facet, nameEn: name, normalized: norm })
      .onConflictDoUpdate({ target: tags.normalized, set: { nameEn: name, facet } })
      .returning({ id: tags.id });
    idByNorm.set(norm, row.id);
  }

  // Link each dish to its tags (idempotent via the dish_tag_uq unique).
  const dishRows = await db.select({ id: dishes.id, nameEn: dishes.nameEn }).from(dishes);
  const idByName = new Map(dishRows.map((d) => [d.nameEn, d.id]));
  let links = 0;
  for (const d of dishesData) {
    const dishId = idByName.get(d.nameEn);
    if (!dishId) continue;
    for (const name of d.tags ?? []) {
      const tagId = idByNorm.get(normalizeName(name));
      if (!tagId) continue;
      const res = await db.insert(dishTags).values({ dishId, tagId })
        .onConflictDoNothing({ target: [dishTags.dishId, dishTags.tagId] });
      links += res.rowCount ?? 0;
    }
  }
  return { vocab: idByNorm.size, links };
}
