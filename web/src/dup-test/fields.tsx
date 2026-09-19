import { useId } from 'react'

import { CitySearchCombobox } from '@/components/CitySearchCombobox'
import type { City } from '@/types'

const INPUT_CLASS =
  'h-12 w-full rounded-none border border-neutral-400 bg-white px-3 text-base text-black shadow-none focus-visible:border-black focus-visible:ring-0'

type CityFieldProps = {
  label: string
  helper?: string
  value: City | null
  onChange: (city: City | null) => void
  placeholder: string
}

export function CityField({ label, helper, value, onChange, placeholder }: CityFieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-black">
        {label}
      </label>
      <CitySearchCombobox
        id={id}
        value={value}
        onValueChange={onChange}
        placeholder={placeholder}
        className={`${INPUT_CLASS} placeholder:text-neutral-500`}
      />
      {helper && <p className="text-sm text-neutral-600">{helper}</p>}
    </div>
  )
}

type YearFieldProps = {
  label: string
  helper?: string
  value: number | null
  onChange: (year: number | null) => void
  min: number
  max: number
  /** Adds "· age N" to each option, to help people place a move. */
  ageFrom?: number
  /** Newest first suits birth years; oldest first suits moves. */
  descending?: boolean
}

/**
 * Native select: explicit, keyboard and screen-reader friendly, and it opens
 * the phone's own picker rather than asking for a drag.
 */
export function YearField({ label, helper, value, onChange, min, max, ageFrom, descending }: YearFieldProps) {
  const id = useId()
  const helperId = `${id}-helper`
  const years = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i)
  if (descending) years.reverse()

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-black">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        aria-describedby={helper ? helperId : undefined}
        className={`${INPUT_CLASS} appearance-auto`}
      >
        <option value="">Choose a year</option>
        {years.map((year) => (
          <option key={year} value={year}>
            {ageFrom !== undefined ? `${year} · age ${year - ageFrom}` : year}
          </option>
        ))}
      </select>
      {helper && (
        <p id={helperId} className="text-sm text-neutral-600">
          {helper}
        </p>
      )}
    </div>
  )
}
