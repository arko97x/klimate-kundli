import { ChevronRightIcon } from 'lucide-react'

import { BirthYearPicker } from '@/components/BirthYearPicker'
import { DisabledTooltip } from '@/components/DisabledTooltip'
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
  onNext?: () => void
  showContinue?: boolean
}

export function BirthStep({
  birthCity,
  onBirthCityChange,
  birthYear,
  onBirthYearChange,
  latestCompleteYear,
  onNext,
  showContinue = true,
}: BirthStepProps) {
  const canContinue = birthCity !== null
  const controlWidth = 'w-full max-w-sm'

  return (
    <div className="w-full max-w-md space-y-10 px-1.5">
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

      {showContinue ? (
        <div className="flex justify-end pt-2">
          <DisabledTooltip
            disabled={!canContinue}
            content="Select your birth city"
          >
            <Button
              type="button"
              size="icon"
              disabled={!canContinue}
              onClick={onNext}
              aria-label="Continue"
            >
              <ChevronRightIcon className="size-5" />
            </Button>
          </DisabledTooltip>
        </div>
      ) : null}
    </div>
  )
}
