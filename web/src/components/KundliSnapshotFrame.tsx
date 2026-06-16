import type { KundliSnapshot } from '@/lib/api'

type KundliSnapshotFrameProps = {
  snapshot: KundliSnapshot
  createdAt: string
  birthCityDisplay: string
  birthYear: number
}

export function KundliSnapshotFrame({
  snapshot,
  createdAt,
  birthCityDisplay,
  birthYear,
}: KundliSnapshotFrameProps) {
  const created = formatCreatedAt(createdAt)

  return (
    <article className="mx-auto w-full max-w-5xl space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Frozen Kundli
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            {shortCity(birthCityDisplay)}, {birthYear}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">Created {created}</p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          Snapshot captured {formatCreatedAt(snapshot.createdAt)} · design v{snapshot.version}
        </div>
        <div className="bg-white">
          {snapshot.chunks
            .slice()
            .sort((a, b) => a.index - b.index)
            .map((chunk) => (
              <img
                key={`${chunk.index}-${chunk.url}`}
                src={chunk.url}
                width={chunk.width}
                height={chunk.height}
                alt={`Kundli snapshot page section ${chunk.index + 1}`}
                loading={chunk.index === 0 ? 'eager' : 'lazy'}
                className="block h-auto w-full"
              />
            ))}
        </div>
      </div>
    </article>
  )
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function shortCity(displayName: string): string {
  return displayName.split(',')[0]?.trim() ?? displayName
}
