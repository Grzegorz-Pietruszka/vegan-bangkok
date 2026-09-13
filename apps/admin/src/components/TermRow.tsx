'use client';
import { useState, useTransition } from 'react';
import { approveTerm } from '@/lib/termActions';

export function TermRow({ term, freq }: { term: string; freq: number }) {
  const [target, setTarget] = useState<'dish' | 'ingredient' | 'alias' | 'tag'>('ingredient');
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string>();
  if (done) return <tr><td>{term}</td><td>{freq}</td><td colSpan={2} style={{ color: 'var(--accent-green)' }}>added ✓</td></tr>;
  return (
    <tr>
      <td style={{ fontSize: 16 }}>{term}</td>
      <td>{freq}</td>
      <td>
        <select value={target} onChange={(e) => setTarget(e.target.value as 'dish' | 'ingredient' | 'alias' | 'tag')}>
          <option value="dish">dish</option><option value="ingredient">ingredient</option><option value="alias">alias</option>
          <option value="tag">tag</option>
        </select>
      </td>
      <td>
        <form action={(fd) => start(async () => {
          const res = await approveTerm(term, target, fd);
          if (res?.error) setErr(res.error); else { setErr(undefined); setDone(true); }
        })}>
          {target === 'ingredient' && <input name="veganRiskClass" placeholder="hard_block|conditional_review|safe" defaultValue="conditional_review" />}
          {target === 'alias' && <input name="ingredientId" placeholder="ingredient UUID" />}
          {target === 'tag' && (
            <select name="facet" defaultValue="flavor">
              <option value="flavor">flavor</option>
              <option value="cooking_method">cooking_method</option>
              <option value="form">form</option>
              <option value="ingredient_type">ingredient_type</option>
              <option value="course">course</option>
            </select>
          )}
          <input name="nameEn" placeholder="English name (optional)" />
          <button className="pill pill-dark" disabled={pending} type="submit">approve</button>
        </form>
        {err ? <p style={{ color: 'var(--accent-pink)' }}>{err}</p> : null}
      </td>
    </tr>
  );
}
