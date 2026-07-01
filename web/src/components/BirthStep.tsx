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
  showContinue = false,
}: BirthStepProps) {
  const canContinue = birthCity !== null

  return (
  <>
    <div className="absolute left-[8%] top-[38%] flex flex-col items-start gap-5 w-[320px] sm:w-[380px] md:w-[420px] xl:w-[450px] pointer-events-auto">
      {/* Unified Question Label */}
      <Label 
        htmlFor="birth-city" 
        className="font-sans text-xl sm:text-2xl md:text-3xl xl:text-4xl font-normal text-black text-left mb-1 select-none"
      >
        When and where were you born?
      </Label>

      {/* Bordered white-bg panel containing inputs */}
      <div className="w-full flex flex-col gap-5 border border-neutral-300 bg-white p-5 rounded-none">
        {/* Input 1: Birth City Search */}
        <div className="w-full">
          <CitySearchCombobox
            id="birth-city"
            className="w-full bg-white border border-neutral-300 text-black placeholder:text-neutral-400 rounded-none h-14 px-4 shadow-none focus-visible:border-neutral-400 focus-visible:ring-0 text-base md:text-lg"
            value={birthCity}
            onValueChange={onBirthCityChange}
            placeholder="Search for your birth city"
          />
        </div>

        {/* Input 2: Birth Year Picker */}
        <div className="w-full">
          <BirthYearPicker
            value={birthYear}
            onValueChange={onBirthYearChange}
            maxYear={latestCompleteYear}
            className="w-full bg-white border border-neutral-300 text-black rounded-none px-4 shadow-none"
          />
        </div>
      </div>
    </div>

    {/* Navigation Next Button — horizontally centered on page */}
    {showContinue && onNext && (
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[10%] pointer-events-auto">
        <DisabledTooltip
          disabled={!canContinue}
          content="Select your birth city"
        >
          <Button
            type="button"
            disabled={!canContinue}
            onClick={onNext}
            className="bg-black text-white hover:bg-black/90 disabled:bg-neutral-300 disabled:text-neutral-500 rounded-none font-semibold tracking-wider shadow-lg w-[180px] h-[44px] sm:w-[240px] sm:h-[52px] text-xs sm:text-sm xl:text-base uppercase transition-all hover:scale-[1.02]"
          >
            Next →
          </Button>
        </DisabledTooltip>
      </div>
    )}
  </>
  )
}
