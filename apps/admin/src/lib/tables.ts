import { tableRegistry, describeTable } from '@vegan-bangkok/db';

export const TABLE_KEYS = Object.keys(tableRegistry).sort();

export function assertTable(key: string): void {
  if (!TABLE_KEYS.includes(key)) throw new Error(`unknown table: ${key}`);
}

export const LABEL_COLUMN: Record<string, string> = {
  regions: 'name', dishes: 'nameEn', places: 'name', ingredients: 'nameEn',
  dishAliases: 'aliasText', ingredientAliases: 'aliasText', menuScanMisses: 'rawText',
  placeDishes: 'id', dishIngredients: 'id', queryEmbeddingCache: 'queryNorm',
  tags: 'nameEn', dishTags: 'id', ingredientTags: 'id',
};

// Rows arrive either drizzle-shaped (camelCase field names) or from raw `SELECT *`
// (snake_case db column names) — resolve the field name first, then its real column.
export function cellValue(row: Record<string, unknown>, f: { name: string; column: string }): unknown {
  return row[f.name] ?? row[f.column];
}

export function rowLabel(table: string, row: Record<string, unknown>): string {
  const col = LABEL_COLUMN[table] ?? 'id';
  const desc = TABLE_KEYS.includes(table) ? describeTable(table).find((f) => f.name === col) : undefined;
  const v = desc ? cellValue(row, desc) : row[col];
  return String(v ?? row.id ?? '');
}
