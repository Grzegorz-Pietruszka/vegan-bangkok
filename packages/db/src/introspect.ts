import { getTableColumns } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import * as schema from './schema.ts';

export type Widget = 'text' | 'number' | 'boolean' | 'date' | 'json' | 'enum' | 'fk' | 'hidden';
export type FieldDescriptor = {
  name: string; column: string; widget: Widget; required: boolean;
  readOnly: boolean; array: boolean; enumValues?: string[]; fkTable?: string;
  /** Multi-line text column — render as a textarea, not a single-line input. */
  long?: boolean;
};

export const tableRegistry = {
  regions: schema.regions, dishes: schema.dishes, places: schema.places,
  placeDishes: schema.placeDishes, dishAliases: schema.dishAliases,
  ingredients: schema.ingredients, ingredientAliases: schema.ingredientAliases,
  dishIngredients: schema.dishIngredients, menuScanMisses: schema.menuScanMisses,
  queryEmbeddingCache: schema.queryEmbeddingCache,
  tags: schema.tags, dishTags: schema.dishTags, ingredientTags: schema.ingredientTags,
} as const;
export type TableKey = keyof typeof tableRegistry;

const READONLY_NAMES = new Set(['id', 'createdAt', 'updatedAt']);

// Pipeline-managed columns: written only by the enrich/embed jobs, never by hand.
// embedding_input in particular is '\n'-composed (apps/api/src/enrich/derive.ts) and the
// embed job uses embeddingInput !== input for staleness — a hand-edit (or a single-line
// <input> flattening its newlines) would trigger paid re-embeds and break the
// embedding↔input correspondence, so the form must never write them.
const PIPELINE_MANAGED = new Set([
  'places.embeddingInput', 'places.embeddingModel', 'places.embeddedAt',
  'places.fetchedAt', 'places.enrichedAt',
  'dishes.embeddingInput', 'dishes.embeddingModel', 'dishes.embeddedAt',
]);

// Multi-line text columns (populated with prose/paragraphs) — rendered as textareas so a
// save round-trip can't strip CR/LF the way a single-line <input> does.
const LONG_TEXT = new Set(['places.summary', 'dishes.description']);

// Enum sources: check-constraint columns carry no metadata on the column object, so the
// allowed values are declared here, copied verbatim from the schema's check() constraints.
const ENUMS: Record<string, string[]> = {
  'places.veganStatus': ['fully_vegan', 'vegetarian_jay', 'vegan_friendly'],
  'ingredients.veganRiskClass': ['hard_block', 'conditional_review', 'safe'],
  'dishIngredients.role': ['primary', 'hidden_risk', 'optional'],
  'tags.facet': ['flavor', 'cooking_method', 'form', 'ingredient_type', 'course'],
};

// Map a table key back to which column references it, so fk targets resolve to a table key.
const FK_MAP: Record<string, string> = {
  'dishes.regionId': 'regions',
  'placeDishes.placeId': 'places', 'placeDishes.dishId': 'dishes',
  'dishAliases.dishId': 'dishes',
  'ingredientAliases.ingredientId': 'ingredients',
  'dishIngredients.dishId': 'dishes', 'dishIngredients.ingredientId': 'ingredients',
  'dishTags.dishId': 'dishes', 'dishTags.tagId': 'tags',
  'ingredientTags.ingredientId': 'ingredients', 'ingredientTags.tagId': 'tags',
};

function widgetFor(table: string, name: string, col: PgColumn): { widget: Widget; enumValues?: string[]; fkTable?: string } {
  const key = `${table}.${name}`;
  if (col.columnType === 'PgVector') return { widget: 'hidden' };
  if (ENUMS[key]) return { widget: 'enum', enumValues: ENUMS[key] };
  if (FK_MAP[key]) return { widget: 'fk', fkTable: FK_MAP[key] };
  switch (col.dataType) {
    case 'boolean': return { widget: 'boolean' };
    case 'number': return { widget: 'number' };
    case 'date': return { widget: 'date' };
    case 'json': return { widget: 'json' };
    default: return { widget: 'text' };
  }
}

export function describeTable(key: string): FieldDescriptor[] {
  const table = (tableRegistry as Record<string, PgTable>)[key];
  if (!table) throw new Error(`unknown table: ${key}`);
  const cols = getTableColumns(table);
  return Object.entries(cols).map(([name, col]) => {
    const c = col as PgColumn;
    const isVector = c.columnType === 'PgVector';
    const { widget, enumValues, fkTable } = widgetFor(key, name, c);
    return {
      name, column: c.name, widget, enumValues, fkTable,
      array: (c as { columnType: string }).columnType === 'PgArray',
      required: c.notNull && !c.hasDefault && !READONLY_NAMES.has(name),
      readOnly: READONLY_NAMES.has(name) || isVector || PIPELINE_MANAGED.has(`${key}.${name}`),
      ...(LONG_TEXT.has(`${key}.${name}`) ? { long: true } : {}),
    };
  });
}
