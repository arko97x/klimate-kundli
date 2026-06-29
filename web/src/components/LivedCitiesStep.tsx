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

const LIVED_CITIES_CONTENT = 'mx-auto w-full max-w-3xl md:pt-8'

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
      <div className={`shrink-0 bg-transparent pb-4 ${sectionPadding}`}>
        <div className={LIVED_CITIES_CONTENT}>
          <div className="space-y-2 pb-3 text-left">
            <Label className="font-alegreya-sans text-3xl md:text-5xl font-semibold tracking-tight text-purple-950 dark:text-white leading-normal">
              Where all have you lived / travelled to?
            </Label>
            <p className="text-sm text-muted-foreground">
              Years are approximate. If you moved during a year, both places can include that year.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[30%_1fr_36px] gap-x-4 gap-y-2 md:gap-8 items-start">
            <div className="hidden md:block" aria-hidden />
            <div className="w-full pt-4 md:pt-8">
              <TimelineYearAxis
                birthYear={birthYear}
                latestCompleteYear={latestCompleteYear}
                dragPreview={
                  dragPreview
                    ? { year: dragPreview.year, percent: dragPreview.percent }
                    : null
                }
              />
            </div>
            <div className="hidden md:block size-9 shrink-0" aria-hidden />
          </div>
        </div>
      </div>

      <div className={`min-h-0 w-full flex-1 overflow-y-auto overscroll-contain bg-transparent ${sectionPadding}`}>
        <div className={LIVED_CITIES_CONTENT}>
          <div className="flex flex-col gap-8 pt-8">
            {rows.map((row, index) => {
              const isBirthRow = index === 0
              const [yearStart, yearEnd] = row.range

              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[1fr_36px] md:grid-cols-[30%_1fr_36px] gap-x-4 gap-y-2 md:gap-8 items-center"
                >
                  <div className="col-span-1 w-full min-w-0 self-center order-1">
                    {isBirthRow ? (
                      <p className="truncate text-sm font-medium text-purple-950 dark:text-white px-1" title={row.city?.displayName}>
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
                    <p className="mt-1 text-sm text-muted-foreground tabular-nums px-1">
                      ({yearStart}–{yearEnd})
                    </p>
                  </div>

                  <div className="col-span-2 md:col-span-1 w-full py-2 order-3 md:order-2">
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
                      className="w-full self-center py-2"
                      aria-label={`Years in ${row.city?.displayName ?? (isBirthRow ? 'birth city' : 'city')}, ${yearStart} to ${yearEnd}`}
                    />
                  </div>

                  <div className="col-span-1 flex justify-end md:justify-center items-center h-9 order-2 md:order-3">
                    {isBirthRow ? null : (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 shrink-0 rounded-md"
                        onClick={() => handleDeleteRow(index)}
                        aria-label="Remove city"
                      >
                        <XIcon className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}

            <div className="grid grid-cols-1 md:grid-cols-[30%_1fr_36px] gap-4 md:gap-8">
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
