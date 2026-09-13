'use client';
import { useState, useTransition } from 'react';
import { setEntityTags, type TagRow } from '@/lib/tagActions';

const FACET_ORDER = ['flavor', 'cooking_method', 'form', 'ingredient_type', 'course'];

export function TagPicker({ table, id, vocab, selectedIds }: {
  table: 'dishes' | 'ingredients'; id: string; vocab: TagRow[]; selectedIds: string[];
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(selectedIds));
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  const [saved, setSaved] = useState(false);

  const toggle = (tagId: string) => {
    const next = new Set(sel);
    next.has(tagId) ? next.delete(tagId) : next.add(tagId);
    setSel(next); setSaved(false);
  };
  const byFacet = (facet: string) => vocab.filter((t) => t.facet === facet);

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Tags</h2>
      {FACET_ORDER.map((facet) => byFacet(facet).length ? (
        <div key={facet} style={{ marginBottom: 12 }}>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 4 }}>{facet}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {byFacet(facet).map((t) => (
              <button key={t.id} type="button" onClick={() => toggle(t.id)}
                className={sel.has(t.id) ? 'pill pill-dark' : 'pill pill-light'}
                style={{ width: 'auto' }}>{t.nameEn}</button>
            ))}
          </div>
        </div>
      ) : null)}
      <button className="pill pill-dark" disabled={pending} style={{ width: 'auto', marginTop: 8 }}
        onClick={() => start(async () => {
          const res = await setEntityTags(table, id, [...sel]);
          if (res.error) { setErr(res.error); setSaved(false); } else { setErr(undefined); setSaved(true); }
        })}>{pending ? 'Saving…' : 'Save tags'}</button>
      {saved ? <span style={{ color: 'var(--accent-green)', marginLeft: 10 }}>saved ✓</span> : null}
      {err ? <p style={{ color: 'var(--accent-pink)' }}>{err}</p> : null}
    </div>
  );
}
