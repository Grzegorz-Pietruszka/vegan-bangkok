import { runMining, reexportBundle } from '@/lib/termActions';
import { TermRow } from '@/components/TermRow';
import { Card } from '@/components/Card';

export const dynamic = 'force-dynamic';

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  const ranked = run ? await runMining() : [];
  return (
    <>
      <h1>Term mining</h1>
      <Card>
        <p style={{ color: 'var(--muted)' }}>
          Reads <code>menu_scan_misses</code> → PyThaiNLP tokenize → subtract known dish/alias/ingredient terms → rank unknown Thai terms by frequency. Approve one to add it to the catalog.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="pill pill-dark" href="/terms?run=1">Run pipeline</a>
          <form action={async () => { 'use server'; await reexportBundle(); }}>
            <button className="pill pill-light" type="submit">Re-export bundle</button>
          </form>
        </div>
      </Card>
      {run ? (
        <Card title={`${ranked.length} unknown terms`}>
          <table>
            <thead><tr><th>term</th><th>freq</th><th>add as</th><th>action</th></tr></thead>
            <tbody>{ranked.slice(0, 100).map((t) => <TermRow key={t.term} term={t.term} freq={t.freq} />)}</tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
