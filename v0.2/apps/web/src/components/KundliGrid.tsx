import { Cell } from "@/components/Cell";
import type { KundliResponse } from "@/lib/types";

type Props = { result: KundliResponse };

// 12 cells in a 3×4 grid on desktop. On mobile we stack 1 col × 12 rows; on
// tablet we step to 2 columns. Cell heights are uniform so the grid reads as
// a kundli diagram and not as a SaaS card grid.
export function KundliGrid({ result }: Props) {
  return (
    <section aria-label="Twelve houses" className="space-y-6">
      <header className="space-y-3 text-center">
        <p className="eyebrow">Janma · Climate</p>
        <h2 className="font-display text-3xl font-medium tracking-tight md:text-4xl">
          {result.visitor.birthName}, {result.visitor.birthYear}
        </h2>
        <p className="font-mono text-xs text-muted-foreground">
          {result.cells.filter((c) => c.status === "ok").length}/12 cells drawn
          {" · "}
          built in {result.elapsedMs}&thinsp;ms
          {" · "}
          {new Date(result.generatedAt).toLocaleString()}
        </p>
        <div className="almanac-rule mx-auto max-w-md" />
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {result.cells.map((cell, i) => (
          <Cell key={cell.id} cell={cell} animIndex={i} />
        ))}
      </div>

      {result.stays.length > 0 && (
        <footer className="space-y-3 pt-4">
          <p className="eyebrow text-center">Stays included in the reading</p>
          <div className="almanac-rule mx-auto max-w-md" />
          <ul className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-xs text-muted-foreground">
            {result.stays.map((s, i) => (
              <li key={`${s.slug}-${i}`} className="whitespace-nowrap">
                <span className="text-foreground/80">{s.name}</span>
                <span className="px-1.5 text-foreground/30">·</span>
                <span>{s.start}</span>
                <span className="px-1 text-foreground/30">→</span>
                <span>{s.end}</span>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </section>
  );
}
