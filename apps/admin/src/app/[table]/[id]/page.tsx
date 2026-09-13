import { sql, getTableName } from 'drizzle-orm';
import { db, tableRegistry, describeTable } from '@/lib/db';
import { assertTable } from '@/lib/tables';
import { updateRow } from '@/lib/actions';
import { RecordForm } from '@/components/RecordForm';
import { DeleteButton } from '@/components/DeleteButton';
import { EnrichButton } from '@/components/EnrichButton';
import { Card } from '@/components/Card';
import { TagPicker } from '@/components/TagPicker';
import { loadVocabulary, loadEntityTagIds } from '@/lib/tagActions';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function EditPage({ params }: { params: Promise<{ table: string; id: string }> }) {
  const { table, id } = await params;
  assertTable(table);
  const t = (tableRegistry as Record<string, unknown>)[table] as Parameters<typeof getTableName>[0];
  const { rows } = await db.execute(sql`SELECT * FROM ${sql.identifier(getTableName(t))} WHERE id = ${id} LIMIT 1`);
  const row = (rows as Record<string, unknown>[])[0];
  if (!row) notFound();
  const fields = describeTable(table);
  const taggable = table === 'dishes' || table === 'ingredients';
  const vocab = taggable ? await loadVocabulary() : [];
  const selectedIds = taggable ? await loadEntityTagIds(table, id) : [];
  const action = updateRow.bind(null, table, id);
  return (
    <>
      <h1>Edit {table}</h1>
      <Card><RecordForm action={action} fields={fields} row={row} submitLabel="Save" /></Card>
      <div style={{ marginTop: 18 }}><DeleteButton table={table} id={id} /></div>
      {table === 'places' ? <div style={{ marginTop: 12 }}><EnrichButton id={id} /></div> : null}
      {taggable ? <TagPicker table={table} id={id} vocab={vocab} selectedIds={selectedIds} /> : null}
    </>
  );
}
