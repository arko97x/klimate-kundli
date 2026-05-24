import type { WheelPickerOption } from '@/components/wheel-picker'
import { WheelPicker, WheelPickerWrapper } from '@/components/wheel-picker'
import { MIN_BIRTH_YEAR, birthYearOptions } from '@/lib/years'

const DEFAULT_YEAR = 1986

function toOptions(years: number[]): WheelPickerOption<number>[] {
  return years.map((value) => ({ label: String(value), value }))
}

type BirthYearPickerProps = {
  value: number
  onValueChange: (year: number) => void
  maxYear: number
}

export function BirthYearPicker({ value, onValueChange, maxYear }: BirthYearPickerProps) {
  const options = toOptions(birthYearOptions(MIN_BIRTH_YEAR, maxYear))

  return (
    <div className="w-full">
      <WheelPickerWrapper className="w-full">
        <WheelPicker
          options={options}
          value={value}
          onValueChange={onValueChange}
          scrollSensitivity={8}
          dragSensitivity={8}
        />
      </WheelPickerWrapper>
    </div>
  )
}

export function defaultBirthYear(): number {
  const years = birthYearOptions()
  return years.includes(DEFAULT_YEAR) ? DEFAULT_YEAR : years[years.length - 1]!
}
