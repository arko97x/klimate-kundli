import { ChevronRightIcon } from 'lucide-react'

import { BirthYearPicker } from '@/components/BirthYearPicker'
import { cn } from '@/lib/utils'
import { CitySearchCombobox } from '@/components/CitySearchCombobox'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { City } from '@/types'

type BirthStepProps = {
  birthCity: City | null
  onBirthCityChange: (city: City | null) => void
  birthYear: number
  onBirthYearChange: (year: number) => void
  latestCompleteYear: number
  onNext: () => void
}

export function BirthStep({
  birthCity,
  onBirthCityChange,
  birthYear,
  onBirthYearChange,
  latestCompleteYear,
  onNext,
}: BirthStepProps) {
  const canContinue = birthCity !== null
  const controlWidth = 'w-full max-w-sm'

  return (
    <div className="mx-auto w-full max-w-md space-y-10">
      <div className={cn('space-y-3', controlWidth)}>
        <Label htmlFor="birth-city">Where were you born…</Label>
        <CitySearchCombobox
          id="birth-city"
          className={controlWidth}
          value={birthCity}
          onValueChange={onBirthCityChange}
          placeholder="Search for your birth city"
        />
      </div>

      <div className={cn('flex flex-col items-start gap-4', controlWidth)}>
        <Label>…and when?</Label>
        <BirthYearPicker
          value={birthYear}
          onValueChange={onBirthYearChange}
          maxYear={latestCompleteYear}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="button"
          size="icon"
          className="size-11 rounded-md"
          disabled={!canContinue}
          onClick={onNext}
          aria-label="Continue"
        >
          <ChevronRightIcon className="size-5" />
        </Button>
      </div>
    </div>
  )
}
