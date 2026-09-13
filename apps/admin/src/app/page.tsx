import { getTableName, sql } from 'drizzle-orm';
import { db, tableRegistry } from '@/lib/db';
import { Card } from '@/components/Card';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const keys = Object.keys(tableRegistry).sort() as (keyof typeof tableRegistry)[];
  const counts = await Promise.all(keys.map(async (k) => {
    const t = tableRegistry[k];
    const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM ${sql.identifier(getTableName(t))}`);
    return { k, n: (rows[0] as { n: number }).n };
  }));
  return (
    <>
      <h1>Admin</h1>
      <div className="grid" style={{ marginTop: 18 }}>
        {counts.map(({ k, n }) => (
          <Link key={k} href={`/${k}`}>
            <Card title={k}><span style={{ fontSize: 34, fontWeight: 800 }}>{n}</span>
              <span style={{ color: 'var(--muted)' }}> rows</span></Card>
          </Link>
        ))}
      </div>
    </>
  );
}
