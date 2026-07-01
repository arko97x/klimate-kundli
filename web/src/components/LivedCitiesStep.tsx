import { ChevronLeftIcon, PlusIcon, XIcon } from 'lucide-react'
import { useMemo } from 'react'
import { CitySearchCombobox } from '@/components/CitySearchCombobox'
import { DisabledTooltip } from '@/components/DisabledTooltip'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  addResidenceRowDisabledReason,
  canAddResidenceRow,
  updateRowRange,
  isLivedFormValid,
  generateKundliDisabledReason,
} from '@/lib/lived-cities'
import { latestCompleteYearUtc } from '@/lib/years'
import type { ResidenceRow } from '@/types'

type LivedCitiesStepProps = {
  birthYear: number
  rows: ResidenceRow[]
  onRowsChange: (rows: ResidenceRow[]) => void
  latestCompleteYear?: number
  error?: string | null
  onBack: () => void
  onGenerate: () => void
  generating?: boolean
}

/** Generate ~6 evenly spaced year ticks for the timeline header. */
function yearTicks(min: number, max: number, count = 6): number[] {
  if (max <= min) return [min]
  const step = (max - min) / (count - 1)
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? max : Math.round(min + i * step),
  )
}

export function LivedCitiesStep({
  birthYear,
  rows,
  onRowsChange,
  latestCompleteYear = latestCompleteYearUtc(),
  error = null,
  onBack,
  onGenerate,
  generating = false,
}: LivedCitiesStepProps) {
  const canAdd = canAddResidenceRow(rows, latestCompleteYear)
  const addDisabledReason = addResidenceRowDisabledReason(rows, latestCompleteYear)

  const canGenerate = isLivedFormValid(rows, latestCompleteYear)
  const generateDisabledReason = generateKundliDisabledReason(rows, latestCompleteYear)
  const generateDisabled = !canGenerate || generating
  const generateTooltip = generating ? 'Generating…' : generateDisabledReason

  const ticks = useMemo(() => yearTicks(birthYear, latestCompleteYear), [birthYear, latestCompleteYear])

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
    value: number | readonly number[]
  ) => {
    handleRangeChange(index, value)
  }

  const handleSliderCommit = (index: number, value: number | readonly number[]) => {
    handleRangeChange(index, value)
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

  /* Layout constants — city label takes ~35%, slider takes rest */
  const LABEL_COL = 'w-[35%] shrink-0'
  const SLIDER_COL = 'flex-1 min-w-0'
  const DELETE_COL = 'w-10 shrink-0'

  return (
  <>
    {/* ── Left-aligned form container ── */}
    <div className="absolute left-[8%] top-[38%] flex flex-col items-start gap-4 w-[84%] sm:w-[84%] md:w-[80%] xl:w-[70%] pointer-events-auto">
      {/* Question Label */}
      <Label
        className="font-sans text-xl sm:text-2xl md:text-3xl xl:text-4xl font-normal text-black text-left mb-2 select-none"
      >
        What places have you lived?
      </Label>

      {/* ── City rows container (bordered, static) ── */}
      <div className="w-full flex flex-col gap-4 border border-neutral-300 bg-white p-5 rounded-none">
        {/* ── Timeline year markers (aligned with slider column) ── */}
        <div className="w-full flex items-end gap-8">
          <div className={LABEL_COL} />
          <div className={`${SLIDER_COL} flex justify-between`}>
            {ticks.map((year, i) => (
              <span key={year} className="text-[10px] sm:text-xs text-neutral-400 font-mono select-none">
                {year}{i === ticks.length - 1 ? <sup>*</sup> : ''}
              </span>
            ))}
          </div>
          {/* spacer for delete column */}
          <div className={DELETE_COL} />
        </div>

        {/* ── Scrollable list of rows ── */}
        <div className="w-full max-h-[calc(44vh-70px)] overflow-y-auto flex flex-col gap-6 scrollbar-thin scrollbar-thumb-neutral-300 pr-1 relative">
          {/* Vertical grid lines background guides */}
          <div className="absolute inset-y-0 left-0 right-0 pointer-events-none flex z-0 gap-8">
            <div className={LABEL_COL} />
            <div className={`${SLIDER_COL} h-full flex justify-between`}>
              {ticks.map((year) => (
                <div key={year} className="w-[1px] h-full border-l border-neutral-300" />
              ))}
            </div>
            <div className={DELETE_COL} />
          </div>

          {rows.map((row, index) => {
            const isBirthRow = index === 0
            const [yearStart, yearEnd] = row.range

            return (
              <div key={row.id} className="w-full flex flex-col gap-1 relative z-10">
                {/* Row content containing inputs, slider, and delete button centered vertically */}
                <div className="w-full flex items-center gap-8">
                  {/* ── City label / input ── */}
                  <div className={LABEL_COL}>
                    {isBirthRow ? (
                      <span
                        className="text-sm sm:text-base font-semibold text-black truncate block pl-1"
                        title={row.city?.displayName}
                      >
                        {row.city?.displayName ?? '—'}
                      </span>
                    ) : (
                      <CitySearchCombobox
                        className="w-full bg-white border border-neutral-300 text-black placeholder:text-neutral-400 rounded-none h-10 px-3 shadow-none focus-visible:border-neutral-400 focus-visible:ring-0 text-base md:text-lg"
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

                  {/* ── Slider ── */}
                  <div className={SLIDER_COL}>
                    <Slider
                      min={birthYear}
                      max={latestCompleteYear}
                      step={1}
                      minStepsBetweenValues={0}
                      value={row.range}
                      onValueChange={(value) => handleSliderChange(index, value)}
                      onValueCommitted={(value) => handleSliderCommit(index, value)}
                      className="w-full py-2"
                      aria-label={`Years in ${row.city?.displayName ?? (isBirthRow ? 'birth city' : 'city')}`}
                    />
                  </div>

                  {/* ── Delete button (or spacer for birth row) ── */}
                  <div className={DELETE_COL}>
                    {!isBirthRow && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-10 text-neutral-700 hover:text-black hover:border-black hover:bg-neutral-50 border-neutral-300 rounded-none shadow-none transition-colors"
                        onClick={() => handleDeleteRow(index)}
                        aria-label="Remove city"
                      >
                        <XIcon className="size-5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Year range subtext, aligned under the input column */}
                <div className="w-full flex">
                  <div className={`${LABEL_COL} pl-1`}>
                    <span className="text-xs text-neutral-400 font-mono">
                      ({yearStart}–{yearEnd})
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Add City Button */}
      <div className="w-full flex justify-start">
        <DisabledTooltip disabled={!canAdd} content={addDisabledReason}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="text-neutral-700 border-neutral-300 hover:border-black hover:bg-neutral-50 hover:text-black size-10 rounded-none transition-colors"
            disabled={!canAdd}
            onClick={handleAddRow}
            aria-label="Add another city"
          >
            <PlusIcon className="size-5" />
          </Button>
        </DisabledTooltip>
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 px-3 py-2 w-full" role="alert">
          {error}
        </p>
      )}
    </div>

    {/* ── Bottom action buttons — horizontally centered on page ── */}
    <div className="absolute left-1/2 -translate-x-1/2 bottom-[6%] pointer-events-auto flex items-center gap-4">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="text-black border-neutral-300 hover:bg-neutral-50 rounded-none size-[44px] sm:size-[52px] shrink-0"
        onClick={onBack}
        aria-label="Back"
      >
        <ChevronLeftIcon className="size-5 sm:size-6" />
      </Button>
      <DisabledTooltip disabled={generateDisabled} content={generateTooltip}>
        <Button
          type="button"
          className="bg-black text-white hover:bg-black/90 disabled:bg-neutral-300 disabled:text-neutral-500 rounded-none font-semibold tracking-wider shadow-lg w-[180px] h-[44px] sm:w-[240px] sm:h-[52px] text-xs sm:text-sm xl:text-base uppercase transition-all hover:scale-[1.02]"
          disabled={generateDisabled}
          onClick={onGenerate}
        >
          {generating ? 'Generating…' : 'Generate Kundli'}
        </Button>
      </DisabledTooltip>
    </div>
  </>
  )
}
