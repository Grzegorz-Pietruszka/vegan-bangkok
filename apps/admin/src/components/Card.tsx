export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      {title ? <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>{title}</h2> : null}
      {children}
    </section>
  );
}
