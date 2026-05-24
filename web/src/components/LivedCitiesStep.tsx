import { useState } from 'react'
import type { SliderRoot } from '@base-ui/react/slider'
import { ChevronLeftIcon, PlusIcon } from 'lucide-react'

import { CitySearchCombobox } from '@/components/CitySearchCombobox'
import { TimelineYearAxis } from '@/components/TimelineYearAxis'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { canAddResidenceRow, updateRowRange } from '@/lib/lived-cities'
import { latestCompleteYearUtc, yearToTimelinePercent } from '@/lib/years'
import type { ResidenceRow } from '@/types'

const ACTIVE_SLIDER_REASONS = new Set<SliderRoot.ChangeEventReason>([
  'drag',
  'track-press',
  'keyboard',
])

type DragPreview = {
  year: number
  percent: number
}

type LivedCitiesStepProps = {
  birthYear: number
  rows: ResidenceRow[]
  onRowsChange: (rows: ResidenceRow[]) => void
  latestCompleteYear?: number
  error?: string | null
}

export function LivedCitiesStep({
  birthYear,
  rows,
  onRowsChange,
  latestCompleteYear = latestCompleteYearUtc(),
  error = null,
}: LivedCitiesStepProps) {
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const canAdd = canAddResidenceRow(rows, latestCompleteYear)

  const normalizeRange = (value: number | readonly number[]): [number, number] | null => {
    const arr = Array.isArray(value) ? [...value] : [value]
    return arr.length >= 2 ? [arr[0]!, arr[1]!] : null
  }

  const handleRangeChange = (index: number, value: number | readonly number[]) => {
    const range = normalizeRange(value)
    if (!range) {
      return
    }
    onRowsChange(updateRowRange(rows, index, range, birthYear, latestCompleteYear))
  }

  const handleSliderChange = (
    index: number,
    value: number | readonly number[],
    details: SliderRoot.ChangeEventDetails,
  ) => {
    const range = normalizeRange(value)
    if (!range) {
      return
    }

    handleRangeChange(index, value)

    if (ACTIVE_SLIDER_REASONS.has(details.reason)) {
      const thumbIndex = Math.min(details.activeThumbIndex, range.length - 1)
      const year = range[thumbIndex]!
      setDragPreview({
        year,
        percent: yearToTimelinePercent(year, birthYear, latestCompleteYear),
      })
    }
  }

  const handleSliderCommit = (index: number, value: number | readonly number[]) => {
    handleRangeChange(index, value)
    setDragPreview(null)
  }

  const handleAddRow = () => {
    const last = rows[rows.length - 1]
    if (!last || !canAdd) {
      return
    }
    const start = last.range[1]
    onRowsChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        city: null,
        range: [start, latestCompleteYear],
      },
    ])
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="space-y-2 text-center sm:text-left">
        <Label>Where all have you lived / travelled to?</Label>
        <p className="text-sm text-muted-foreground">
          Years are approximate. If you moved during a year, both places can include that year.
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-8">
        <TimelineYearAxis
          birthYear={birthYear}
          latestCompleteYear={latestCompleteYear}
          dragPreview={
            dragPreview
              ? { year: dragPreview.year, percent: dragPreview.percent }
              : null
          }
        />

        {rows.map((row, index) => {
          const isBirthRow = index === 0
          const [yearStart, yearEnd] = row.range

          return (
            <div key={row.id} className="contents">
              <div className="col-start-1 flex min-w-0 flex-col justify-center gap-0.5 self-center">
                {isBirthRow ? (
                  <p className="truncate text-sm font-medium" title={row.city?.displayName}>
                    {row.city?.displayName ?? '—'}
                  </p>
                ) : (
                  <CitySearchCombobox
                    value={row.city}
                    onValueChange={(city) => {
                      onRowsChange(
                        rows.map((r) => (r.id === row.id ? { ...r, city } : r)),
                      )
                    }}
                    placeholder="Search city"
                  />
                )}
                <p className="text-xs text-muted-foreground tabular-nums">
                  ({yearStart}–{yearEnd})
                </p>
              </div>

              <Slider
                min={birthYear}
                max={latestCompleteYear}
                step={1}
                minStepsBetweenValues={0}
                value={row.range}
                onValueChange={(value, details) =>
                  handleSliderChange(index, value, details)
                }
                onValueCommitted={(value) => handleSliderCommit(index, value)}
                className="col-start-2 w-full py-2"
                aria-label={`Years in ${row.city?.displayName ?? (isBirthRow ? 'birth city' : 'city')}, ${yearStart} to ${yearEnd}`}
              />
            </div>
          )
        })}

        <div className="col-start-1 self-start">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 rounded-md"
            disabled={!canAdd}
            onClick={handleAddRow}
            aria-label="Add another city"
          >
            <PlusIcon className="size-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-center text-sm text-destructive sm:text-left" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function LivedCitiesStepFooter({
  onBack,
  onGenerate,
  generating = false,
  canGenerate = false,
}: {
  onBack: () => void
  onGenerate: () => void
  generating?: boolean
  canGenerate?: boolean
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 rounded-md"
        onClick={onBack}
        aria-label="Back"
      >
        <ChevronLeftIcon className="size-5" />
      </Button>
      <Button
        type="button"
        className="min-w-44 rounded-md px-8"
        disabled={!canGenerate || generating}
        onClick={onGenerate}
      >
        {generating ? 'Generating…' : 'Generate Kundli'}
      </Button>
    </>
  )
}
