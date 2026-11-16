export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: [string, string][] }) {
  return (
    <div className="container max-w-3xl py-16">
      <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
      <p className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">Template text for review by qualified legal counsel before publication.</p>
      <div className="mt-8 space-y-8">
        {sections.map(([h, b], i) => (
          <section key={h}>
            <h2 className="text-lg font-semibold">
              {i + 1}. {h}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{b}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
