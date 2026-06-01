import {
  timelineTickHiddenWhileDragging,
  timelineTickPositionPercent,
  timelineTickYears,
} from '@/lib/years'

type DragPreview = {
  year: number
  percent: number
}

type TimelineYearAxisProps = {
  birthYear: number
  latestCompleteYear: number
  dragPreview: DragPreview | null
}

export function TimelineYearAxis({
  birthYear,
  latestCompleteYear,
  dragPreview,
}: TimelineYearAxisProps) {
  const ticks = timelineTickYears(birthYear, latestCompleteYear)

  return (
    <div className="relative col-start-2 h-9">
      {ticks.map((year, index) => {
        if (
          dragPreview &&
          timelineTickHiddenWhileDragging(
            index,
            ticks.length,
            year,
            dragPreview.year,
            dragPreview.percent,
          )
        ) {
          return null
        }

        const pct = timelineTickPositionPercent(index, ticks.length)
        const isFirst = index === 0
        const isLast = index === ticks.length - 1

        return (
          <span
            key={year}
            className="absolute bottom-1.5 text-xs tabular-nums text-muted-foreground transition-opacity duration-75"
            style={{
              left: `${pct}%`,
              transform: isFirst
                ? 'translateX(0)'
                : isLast
                  ? 'translateX(-100%)'
                  : 'translateX(-50%)',
            }}
          >
            {year}
          </span>
        )
      })}

      {dragPreview ? (
        <>
          <span
            className="absolute bottom-1.5 z-20 -translate-x-1/2 text-xs font-medium tabular-nums text-foreground"
            style={{ left: `${dragPreview.percent}%` }}
          >
            {dragPreview.year}
          </span>
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px -translate-x-1/2 bg-muted-foreground/60"
            style={{ left: `${dragPreview.percent}%` }}
            aria-hidden
          />
        </>
      ) : null}

      <div className="absolute right-0 bottom-0 left-0 h-px bg-border" aria-hidden />
    </div>
  )
}
