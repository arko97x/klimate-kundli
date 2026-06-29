import { ChevronRightIcon } from 'lucide-react'

import { BirthYearPicker } from '@/components/BirthYearPicker'
import { DisabledTooltip } from '@/components/DisabledTooltip'
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

  return (
    <div className="w-full max-w-3xl space-y-8 px-1.5 mx-auto md:pt-8">
      <div className="grid grid-cols-1 md:grid-cols-[350px_1fr] items-start gap-4 md:gap-8">
        <Label htmlFor="birth-city" className="font-alegreya-sans text-3xl md:text-5xl font-semibold tracking-tight text-purple-950 dark:text-white">
          Where were you born?
        </Label>
        <div className="w-full max-w-sm md:pt-4">
          <CitySearchCombobox
            id="birth-city"
            className="w-full"
            value={birthCity}
            onValueChange={onBirthCityChange}
            placeholder="Search for your birth city"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[350px_1fr] items-start gap-4 md:gap-8">
        <Label className="font-alegreya-sans text-3xl md:text-5xl font-semibold tracking-tight text-purple-950 dark:text-white leading-normal">
          And when?
        </Label>
        <div className="w-full max-w-sm md:pt-4">
          <BirthYearPicker
            value={birthYear}
            onValueChange={onBirthYearChange}
            maxYear={latestCompleteYear}
          />
        </div>
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
