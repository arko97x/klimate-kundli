import { useState } from 'react'
import type { SliderRoot } from '@base-ui/react/slider'
import { ChevronLeftIcon, PlusIcon, XIcon } from 'lucide-react'

import { CitySearchCombobox } from '@/components/CitySearchCombobox'
import { DisabledTooltip } from '@/components/DisabledTooltip'
import { TimelineYearAxis } from '@/components/TimelineYearAxis'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { addResidenceRowDisabledReason, canAddResidenceRow, updateRowRange } from '@/lib/lived-cities'
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
  embedded?: boolean
}

const LIVED_CITIES_GRID =
  'grid grid-cols-[11rem_minmax(0,1fr)_2.25rem] gap-x-4'

const LIVED_CITIES_CONTENT = 'mx-auto w-full max-w-2xl'

export function LivedCitiesStep({
  birthYear,
  rows,
  onRowsChange,
  latestCompleteYear = latestCompleteYearUtc(),
  error = null,
  embedded = false,
}: LivedCitiesStepProps) {
  const sectionPadding = embedded ? 'px-1.5' : 'px-6 sm:px-10 lg:px-14'
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const canAdd = canAddResidenceRow(rows, latestCompleteYear)
  const addDisabledReason = addResidenceRowDisabledReason(rows, latestCompleteYear)

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

  const handleDeleteRow = (index: number) => {
    if (index === 0) {
      return
    }
    onRowsChange(rows.filter((_, i) => i !== index))
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className={`shrink-0 bg-background pb-4 ${sectionPadding}`}>
        <div className={LIVED_CITIES_CONTENT}>
          <div className="space-y-2 pb-3 text-center sm:text-left">
            <Label>Where all have you lived / travelled to?</Label>
            <p className="text-sm text-muted-foreground">
              Years are approximate. If you moved during a year, both places can include that year.
            </p>
          </div>

          <div className={LIVED_CITIES_GRID}>
            <div aria-hidden />
            <TimelineYearAxis
              birthYear={birthYear}
              latestCompleteYear={latestCompleteYear}
              dragPreview={
                dragPreview
                  ? { year: dragPreview.year, percent: dragPreview.percent }
                  : null
              }
            />
            <div className="size-9 shrink-0" aria-hidden />
          </div>
        </div>
      </div>

      <div className={`min-h-0 w-full flex-1 overflow-y-auto overscroll-contain ${sectionPadding}`}>
        <div className={LIVED_CITIES_CONTENT}>
          <div className="flex flex-col gap-8 pt-8">
            {rows.map((row, index) => {
              const isBirthRow = index === 0
              const [yearStart, yearEnd] = row.range

              return (
                <div
                  key={row.id}
                  className={`${LIVED_CITIES_GRID} grid-rows-[auto_auto] items-center gap-y-0.5`}
                >
                  <div className="col-start-1 row-start-1 min-w-0 self-center">
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
                    className="col-start-2 row-start-1 w-full self-center py-2"
                    aria-label={`Years in ${row.city?.displayName ?? (isBirthRow ? 'birth city' : 'city')}, ${yearStart} to ${yearEnd}`}
                  />

                  {isBirthRow ? (
                    <div
                      className="col-start-3 row-start-1 size-9 shrink-0 self-center"
                      aria-hidden
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="col-start-3 row-start-1 size-9 shrink-0 self-center rounded-md"
                      onClick={() => handleDeleteRow(index)}
                      aria-label="Remove city"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  )}

                  <p className="col-start-1 row-start-2 text-xs text-muted-foreground tabular-nums">
                    ({yearStart}–{yearEnd})
                  </p>
                </div>
              )
            })}

            <div className={LIVED_CITIES_GRID}>
              <div className="col-start-1 self-center">
                <DisabledTooltip disabled={!canAdd} content={addDisabledReason}>
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
                </DisabledTooltip>
              </div>
            </div>
          </div>

          {error ? (
            <p className="mt-8 text-center text-sm text-destructive sm:text-left" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function LivedCitiesStepFooter({
  onBack,
  onGenerate,
  generating = false,
  canGenerate = false,
  generateDisabledReason = null,
}: {
  onBack: () => void
  onGenerate: () => void
  generating?: boolean
  canGenerate?: boolean
  generateDisabledReason?: string | null
}) {
  const generateDisabled = !canGenerate || generating
  const generateTooltip =
    generating ? 'Generating…' : generateDisabledReason

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onBack}
        aria-label="Back"
      >
        <ChevronLeftIcon className="size-5" />
      </Button>
      <DisabledTooltip disabled={generateDisabled} content={generateTooltip}>
        <Button
          type="button"
          className="min-w-44 rounded-md px-8"
          disabled={generateDisabled}
          onClick={onGenerate}
        >
          {generating ? 'Generating…' : 'Generate Kundli'}
        </Button>
      </DisabledTooltip>
    </>
  )
}
