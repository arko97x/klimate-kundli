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
    <div className="w-full flex flex-col items-center gap-6">
      {/* City Section */}
      <div className="w-full flex flex-col items-center gap-2">
        <Label 
          htmlFor="birth-city" 
          className="font-alegreya text-2xl md:text-3xl font-medium tracking-wide text-white text-center"
        >
          Where were you born?
        </Label>
        <div className="w-full">
          <CitySearchCombobox
            id="birth-city"
            className="w-full bg-white/10 border-white/20 text-white placeholder:text-white/50 rounded-none h-10 px-3"
            value={birthCity}
            onValueChange={onBirthCityChange}
            placeholder="Search for your birth city"
          />
        </div>
      </div>

      {/* Year Section */}
      <div className="w-full flex flex-col items-center gap-2">
        <Label 
          className="font-alegreya text-2xl md:text-3xl font-medium tracking-wide text-white text-center"
        >
          And when?
        </Label>
        <div className="w-full">
          <BirthYearPicker
            value={birthYear}
            onValueChange={onBirthYearChange}
            maxYear={latestCompleteYear}
          />
        </div>
      </div>

      {/* Navigation Controls */}
      {showContinue && onNext && (
        <div className="w-full pt-4 flex justify-center">
          <DisabledTooltip
            disabled={!canContinue}
            content="Select your birth city"
          >
            <Button
              type="button"
              disabled={!canContinue}
              onClick={onNext}
              className="w-full min-h-[44px] bg-white text-[#180033] hover:bg-white/90 rounded-none font-medium tracking-wide border border-transparent shadow-md transition-all active:scale-[0.98]"
            >
              Continue
            </Button>
          </DisabledTooltip>
        </div>
      )}
    </div>
  )
}
