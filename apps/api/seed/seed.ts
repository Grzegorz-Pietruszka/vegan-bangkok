import { eq } from 'drizzle-orm';
import type { DB } from '../src/db/index.ts';
import { regions, dishes, places, placeDishes, dishAliases, ingredients, ingredientAliases, historicSites } from '../src/db/schema.ts';
import { normalizeName } from '../src/search/normalize.ts';
import { isVibeTag } from '../src/enrich/vibeVocab.ts';
import data from './data.json' with { type: 'json' };
import sites from './historic-sites.json' with { type: 'json' };

export async function seedDatabase(db: DB) {
  const regionId = new Map<string, string>();
  for (const r of data.regions) {
    const [row] = await db.insert(regions).values({ name: r.name, description: r.description })
      .onConflictDoNothing({ target: regions.name }).returning({ id: regions.id, name: regions.name });
    const id = row?.id ?? (await db.select().from(regions).where(eq(regions.name, r.name)))[0].id;
    regionId.set(r.name, id);
  }
  const dishId = new Map<string, string>();
  for (const d of data.dishes) {
    const existing = (await db.select().from(dishes).where(eq(dishes.nameEn, d.nameEn)))[0];
    const id = existing?.id ?? (await db.insert(dishes).values({
      nameEn: d.nameEn, nameTh: d.nameTh, regionId: regionId.get(d.region),
      description: d.description, spiceLevel: d.spiceLevel,
      orderPhrase: d.orderPhrase, skipIngredients: d.skipIngredients,
    }).returning({ id: dishes.id }))[0].id;
    dishId.set(d.nameEn, id);
  }
  const placeId = new Map<string, string>();
  for (const p of data.places) {
    const existing = (await db.select().from(places).where(eq(places.name, p.name)))[0];
    const id = existing?.id ?? (await db.insert(places).values(p).returning({ id: places.id }))[0].id;
    placeId.set(p.name, id);
  }
  for (const pd of data.placeDishes) {
    await db.insert(placeDishes).values({
      placeId: placeId.get(pd.place)!, dishId: dishId.get(pd.dish)!,
      verifiedVegan: pd.verifiedVegan, source: pd.source, confidence: pd.confidence, lovedCount: pd.lovedCount,
    }).onConflictDoNothing();
  }
  // Menu-scan dictionaries (plan 11). alias_normalized is computed HERE with normalizeName —
  // JS↔SQL parity means lookups are plain equality on the column, no SQL-side normalizing.
  for (const da of data.dishAliases) {
    for (const alias of da.aliases) {
      await db.insert(dishAliases).values({
        dishId: dishId.get(da.dish)!, aliasText: alias, aliasNormalized: normalizeName(alias),
      }).onConflictDoNothing({ target: dishAliases.aliasNormalized });
    }
  }
  for (const ing of data.ingredients) {
    const existing = (await db.select().from(ingredients).where(eq(ingredients.nameEn, ing.nameEn)))[0];
    const id = existing?.id ?? (await db.insert(ingredients).values({
      nameEn: ing.nameEn, nameTh: ing.nameTh, veganRiskClass: ing.veganRiskClass,
    }).returning({ id: ingredients.id }))[0].id;
    for (const alias of ing.aliases) {
      await db.insert(ingredientAliases).values({
        ingredientId: id, aliasText: alias.text, aliasNormalized: normalizeName(alias.text), language: alias.language,
      }).onConflictDoNothing({ target: ingredientAliases.aliasNormalized });
    }
  }
  // Itinerary stops (plan 10). Curated data — an out-of-vocab vibe tag here is a curation
  // error, so fail loudly rather than filter (unlike the LLM-derive hallucination guard).
  for (const s of sites) {
    for (const v of s.vibeTags) {
      if (!isVibeTag(v)) throw new Error(`historic site ${s.name}: '${v}' not in VIBE_VOCAB`);
    }
    await db.insert(historicSites).values({
      name: s.name, nameTh: s.nameTh, lat: s.lat, lng: s.lng,
      category: s.category, summary: s.summary, vibeTags: s.vibeTags,
    }).onConflictDoNothing({ target: historicSites.name });
  }
}
