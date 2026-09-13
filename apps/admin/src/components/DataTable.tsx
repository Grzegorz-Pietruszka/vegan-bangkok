import Link from 'next/link';
import type { FieldDescriptor } from '@vegan-bangkok/db';
import { cellValue } from '@/lib/tables';

// Columns hidden from the list to keep it readable: vector/embedding + long JSON.
export function DataTable({ table, fields, rows }: {
  table: string; fields: FieldDescriptor[]; rows: Record<string, unknown>[];
}) {
  const cols = fields.filter((f) => f.widget !== 'hidden' && f.widget !== 'json').slice(0, 7);
  return (
    <table>
      <thead><tr>{cols.map((c) => <th key={c.name}>{c.name}</th>)}<th /></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r.id ?? JSON.stringify(r))}>
            {cols.map((c) => <td key={c.name}>{fmt(cellValue(r, c))}</td>)}
            <td><Link href={`/${table}/${r.id}`}>edit →</Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function fmt(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  const s = String(v);
  return s.length > 48 ? s.slice(0, 48) + '…' : s;
}
