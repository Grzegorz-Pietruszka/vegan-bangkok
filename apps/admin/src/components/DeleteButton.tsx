'use client';
import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteRow } from '@/lib/actions';

export function DeleteButton({ table, id }: { table: string; id: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  const router = useRouter();
  return (
    <div>
      <button className="pill pill-light" disabled={pending}
        onClick={() => {
          if (!confirm('Delete this record? This cannot be undone.')) return;
          start(async () => {
            const res = await deleteRow(table, id);
            if (res?.error) setErr(res.error); else router.push(`/${table}`);
          });
        }}>Delete</button>
      {err ? <p style={{ color: 'var(--accent-pink)' }}>{err}</p> : null}
    </div>
  );
}
