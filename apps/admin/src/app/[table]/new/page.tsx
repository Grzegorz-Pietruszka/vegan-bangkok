import { describeTable } from '@/lib/db';
import { assertTable } from '@/lib/tables';
import { createRow } from '@/lib/actions';
import { RecordForm } from '@/components/RecordForm';
import { Card } from '@/components/Card';

export default async function NewPage({ params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  assertTable(table);
  const fields = describeTable(table).filter((f) => !f.readOnly);
  const action = createRow.bind(null, table);
  return <><h1>New {table}</h1><Card><RecordForm action={action} fields={fields} submitLabel="Create" /></Card></>;
}
