import { ChevronLeftIcon, PlusIcon, XIcon } from 'lucide-react'
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

  return (
    <div className="w-full flex flex-col items-center gap-4">
      {/* Title */}
      <div className="w-full flex flex-col items-center gap-1">
        <Label 
          className="font-alegreya text-2xl md:text-3xl font-medium tracking-wide text-white text-center leading-tight"
        >
          Where else did you live?
        </Label>
        <p className="text-xs text-white/60 text-center leading-normal max-w-[280px]">
          Approximate years lived/travelled (overlap is allowed).
        </p>
      </div>

      {/* Scrollable list of city rows */}
      <div className="w-full max-h-[190px] md:max-h-[220px] overflow-y-auto pr-1 flex flex-col gap-4 scrollbar-thin scrollbar-thumb-white/20">
        {rows.map((row, index) => {
          const isBirthRow = index === 0
          const [yearStart, yearEnd] = row.range

          return (
            <div 
              key={row.id} 
              className="flex flex-col gap-2 pb-3 border-b border-white/10 last:border-b-0 last:pb-0"
            >
              <div className="flex items-center justify-between gap-2">
                {isBirthRow ? (
                  <span className="text-sm font-medium text-white truncate max-w-[180px]" title={row.city?.displayName}>
                    {row.city?.displayName ?? '—'}
                  </span>
                ) : (
                  <div className="flex-1 min-w-0">
                    <CitySearchCombobox
                      className="bg-white/10 border-white/20 text-white rounded-none h-8 px-2"
                      value={row.city}
                      onValueChange={(city) => {
                        onRowsChange(
                          rows.map((r) => (r.id === row.id ? { ...r, city } : r)),
                        )
                      }}
                      placeholder="Search city"
                    />
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/70 font-mono whitespace-nowrap">
                    {yearStart}–{yearEnd}
                  </span>
                  {!isBirthRow && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-white/60 hover:text-white hover:bg-white/10 rounded-none shrink-0"
                      onClick={() => handleDeleteRow(index)}
                      aria-label="Remove city"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="px-1">
                <Slider
                  min={birthYear}
                  max={latestCompleteYear}
                  step={1}
                  minStepsBetweenValues={0}
                  value={row.range}
                  onValueChange={(value) => handleSliderChange(index, value)}
                  onValueCommitted={(value) => handleSliderCommit(index, value)}
                  className="w-full py-1.5"
                  aria-label={`Years in ${row.city?.displayName ?? (isBirthRow ? 'birth city' : 'city')}`}
                />
              </div>
            </div>
          )
        })}

        {/* Add City Button inside the scrollable container or below it */}
        <div className="w-full pt-1 flex justify-start">
          <DisabledTooltip disabled={!canAdd} content={addDisabledReason}>
            <Button
              type="button"
              variant="outline"
              className="text-xs text-white border-white/20 hover:bg-white/10 h-8 px-3 rounded-none flex items-center gap-1.5"
              disabled={!canAdd}
              onClick={handleAddRow}
              aria-label="Add another city"
            >
              <PlusIcon className="size-3.5" />
              Add city
            </Button>
          </DisabledTooltip>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-center text-xs text-red-300 font-medium bg-red-950/20 border border-red-500/30 px-2 py-1.5 w-full mt-1" role="alert">
          {error}
        </p>
      )}

      {/* Action Buttons */}
      <div className="w-full pt-4 flex items-center justify-between gap-3 border-t border-white/15">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="text-white border-white/20 hover:bg-white/10 rounded-none size-[44px] shrink-0"
          onClick={onBack}
          aria-label="Back"
        >
          <ChevronLeftIcon className="size-5" />
        </Button>
        <DisabledTooltip disabled={generateDisabled} content={generateTooltip}>
          <Button
            type="button"
            className="flex-1 bg-white text-[#180033] hover:bg-white/90 rounded-none font-medium h-[44px]"
            disabled={generateDisabled}
            onClick={onGenerate}
          >
            {generating ? 'Generating…' : 'Generate Kundli'}
          </Button>
        </DisabledTooltip>
      </div>
    </div>
  )
}
