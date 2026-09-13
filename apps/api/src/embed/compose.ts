export type DishTag = { facet: string; nameEn: string };
export type DishInput = {
  nameEn: string; regionName?: string | null; description?: string | null;
  spiceLevel?: number | null; tags?: DishTag[] | null;
  orderPhrase?: string | null; skipIngredients?: string | null;
};

// Place document for the place embedding (plan 09): name + derived summary + vibe tags.
export type PlaceInput = {
  name?: string | null; summary?: string | null; vibeTags?: readonly string[] | null;
};

export function composePlaceInput(p: PlaceInput): string {
  return [
    p.name,
    p.summary,
    p.vibeTags?.length ? p.vibeTags.join(', ') : null,
  ].filter(Boolean).join('\n');
}

const FACET_LABEL: Record<string, string> = {
  flavor: 'flavors', cooking_method: 'method', form: 'form',
  ingredient_type: 'ingredients', course: 'course',
};
const FACET_ORDER = ['flavor', 'cooking_method', 'form', 'ingredient_type', 'course'];

function tagLines(tags?: DishTag[] | null): string[] {
  if (!tags?.length) return [];
  return FACET_ORDER.flatMap((facet) => {
    const names = tags.filter((t) => t.facet === facet).map((t) => t.nameEn);
    return names.length ? [`${FACET_LABEL[facet]}: ${names.join(', ')}`] : [];
  });
}

export function composeDishInput(d: DishInput): string {
  const notes = [d.orderPhrase, d.skipIngredients].filter(Boolean).join(' — ');
  return [
    d.nameEn,
    d.regionName,
    d.description,
    d.spiceLevel != null ? `spice: ${d.spiceLevel}/5` : null,
    ...tagLines(d.tags),
    notes || null,
  ].filter(Boolean).join('\n');
}
