import type { ReactNode } from 'react'

import { SAMPLE } from '@/expt/ice-lab/sample'
import { IcebergA } from '@/expt/ice-lab/IcebergA'
import { FloesB } from '@/expt/ice-lab/FloesB'
import { CountryC } from '@/expt/ice-lab/CountryC'
import { StripesD } from '@/expt/ice-lab/StripesD'
import { DialE } from '@/expt/ice-lab/DialE'

type Concept = {
  id: string
  title: string
  note: string
  effort: 'Easy' | 'Medium'
  viz: ReactNode
  aspect: string
}

const CONCEPTS: Concept[] = [
  {
    id: 'A',
    title: 'Iceberg cross-section',
    note: 'Side-view berg — the faded cap is what melted since you were born; solid berg is today. Your original idea, as a 2.5D illustration.',
    effort: 'Easy',
    viz: <IcebergA />,
    aspect: 'aspect-[200/220]',
  },
  {
    id: 'B',
    title: 'Two floes · then vs now',
    note: 'Birth-window floe with today’s floe nested inside (area ∝ extent). The cracked gap is the loss. Reuses the tree-ring noise.',
    effort: 'Easy',
    viz: <FloesB />,
    aspect: 'aspect-square',
  },
  {
    id: 'C',
    title: 'Your country, drowned',
    note: 'Your country’s outline flooded with the lost ice — makes "N× your country" literal and personal. Needs committed country outlines.',
    effort: 'Medium',
    viz: <CountryC />,
    aspect: 'aspect-[100/101]',
  },
  {
    id: 'D',
    title: 'Lifetime ice-stripes',
    note: 'Warming-stripes, for ice. One bar per year 1979→now, white = more ice. Iconic, trivial, shows the whole decline arc.',
    effort: 'Easy',
    viz: <StripesD />,
    aspect: 'aspect-[200/120]',
  },
  {
    id: 'E',
    title: 'Ice-lost dial',
    note: 'A ring sized to your birthday ice with the melted share missing. On-brand with the orbit/ring charts; works as a small glyph.',
    effort: 'Easy',
    viz: <DialE />,
    aspect: 'aspect-square',
  },
]

export function IceLabPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl p-6 sm:p-10">
        <header className="space-y-2 pb-8">
          <p className="text-sm text-muted-foreground">Prototype · data-viz lab</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Arctic ice melt — five ways to draw it
          </h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            All five rendered against the same real case: born {SAMPLE.birthYear}, Mumbai. Summer sea
            ice fell from {SAMPLE.birthWindow.extentMkm2} to {SAMPLE.recentWindow.extentMkm2} million
            km² — about {SAMPLE.lostMkm2}M km² lost, ≈ {Math.round(SAMPLE.comparison.multiple * 100)}%
            the area of {SAMPLE.comparison.name}.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {CONCEPTS.map((c) => (
            <figure key={c.id} className="overflow-hidden rounded-xl border border-border bg-muted/10">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                  {c.id}
                </span>
                <span className="font-medium">{c.title}</span>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {c.effort}
                </span>
              </div>
              <div className={`mx-auto w-full max-w-[360px] ${c.aspect}`}>{c.viz}</div>
              <figcaption className="px-4 py-3 text-sm text-muted-foreground">{c.note}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  )
}
