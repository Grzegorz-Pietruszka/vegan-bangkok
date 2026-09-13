'use client';
import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reenrich } from '@/lib/enrich';

export function EnrichButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  const router = useRouter();
  return (
    <>
      <button className="pill pill-light" disabled={pending}
        onClick={() => start(async () => {
          setErr(undefined);
          const r = await reenrich(id);
          if (r.error) setErr(r.error); else router.refresh();
        })}>
        {pending ? 'Enriching…' : 'Re-enrich (Google + Gemini)'}
      </button>
      {err ? <p style={{ color: 'var(--accent-pink)' }}>{err}</p> : null}
    </>
  );
}
