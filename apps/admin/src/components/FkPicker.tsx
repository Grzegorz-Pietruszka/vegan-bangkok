import { sql, getTableName, getTableColumns } from 'drizzle-orm';
import { db, tableRegistry } from '@/lib/db';
import { LABEL_COLUMN } from '@/lib/tables';

// Server component: loads up to 500 rows of the referenced table as <option>s.
export async function FkPicker({ name, fkTable, value, required }: {
  name: string; fkTable: string; value?: string; required: boolean;
}) {
  const t = (tableRegistry as Record<string, unknown>)[fkTable] as Parameters<typeof getTableName>[0];
  const label = LABEL_COLUMN[fkTable] ?? 'id';
  // LABEL_COLUMN holds camelCase field names; resolve to the real db column for raw SQL.
  const labelColumn = (getTableColumns(t) as Record<string, { name: string }>)[label]?.name ?? 'id';
  const { rows } = await db.execute(
    sql`SELECT id, ${sql.identifier(labelColumn)} AS label FROM ${sql.identifier(getTableName(t))} ORDER BY 2 LIMIT 500`,
  );
  return (
    <select name={name} defaultValue={value ?? ''} required={required}>
      <option value="">— none —</option>
      {(rows as { id: string; label: string }[]).map((r) => (
        <option key={r.id} value={r.id}>{r.label} ({String(r.id).slice(0, 8)})</option>
      ))}
    </select>
  );
}
