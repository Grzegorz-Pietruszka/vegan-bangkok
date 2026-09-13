import Link from 'next/link';
import { tableRegistry } from '@vegan-bangkok/db';

export function Nav() {
  const tables = Object.keys(tableRegistry).sort();
  return (
    <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
      background: '#fff', borderRadius: 999, padding: 8, boxShadow: 'var(--shadow)', margin: '8px 0 24px' }}>
      <Link className="pill pill-dark" href="/">Dashboard</Link>
      <Link className="pill pill-light" href="/terms">Term mining</Link>
      {tables.map((t) => <Link key={t} className="pill pill-light" href={`/${t}`}>{t}</Link>)}
    </nav>
  );
}
