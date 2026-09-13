import { sql, getTableName } from 'drizzle-orm';
import { db, tableRegistry, describeTable } from '@/lib/db';
import { assertTable } from '@/lib/tables';
import { DataTable } from '@/components/DataTable';
import { Card } from '@/components/Card';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ListPage({ params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  assertTable(table);
  const t = (tableRegistry as Record<string, unknown>)[table] as Parameters<typeof getTableName>[0];
  const fields = describeTable(table);
  const { rows } = await db.execute(
    sql`SELECT * FROM ${sql.identifier(getTableName(t))} ORDER BY 1 LIMIT 200`,
  );
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{table}</h1>
        <Link className="pill pill-dark" href={`/${table}/new`}>+ New</Link>
      </div>
      <Card><DataTable table={table} fields={fields} rows={rows as Record<string, unknown>[]} /></Card>
    </>
  );
}
