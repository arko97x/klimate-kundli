import { useMemo, useState } from 'react'

import { BirthStep } from '@/components/BirthStep'
import {
  LivedCitiesStep,
  LivedCitiesStepFooter,
} from '@/components/LivedCitiesStep'
import { MonthlyDeltaChart } from '@/components/MonthlyDeltaChart'
import { WizardLayout } from '@/components/WizardLayout'
import { defaultBirthYear } from '@/components/BirthYearPicker'
import { fetchMonthlyDelta, type MonthlyDeltaResponse } from '@/lib/api'
import { createInitialRows, generateKundliDisabledReason, isLivedFormValid, rowsToLivedCities } from '@/lib/lived-cities'
import { latestCompleteYearUtc, MIN_BIRTH_YEAR } from '@/lib/years'
import type { City, ResidenceRow } from '@/types'

type Step = 'birth' | 'lived'

function initialBirthYear(): number {
  const param = new URLSearchParams(window.location.search).get('birthYear')
  if (!param) {
    return defaultBirthYear()
  }

  const year = Number(param)
  const latest = latestCompleteYearUtc()
  if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR || year > latest) {
    return defaultBirthYear()
  }

  return year
}

export default function KundliApp() {
  const latestCompleteYear = useMemo(() => latestCompleteYearUtc(), [])
  const [step, setStep] = useState<Step>('birth')
  const [birthCity, setBirthCity] = useState<City | null>(null)
  const [birthYear, setBirthYear] = useState(initialBirthYear)
  const [rows, setRows] = useState<ResidenceRow[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MonthlyDeltaResponse | null>(null)

  const goToLived = () => {
    if (!birthCity) {
      return
    }
    setRows(createInitialRows(birthCity, birthYear, latestCompleteYear))
    setStep('lived')
    setError(null)
    setResult(null)
  }

  const handleGenerate = async () => {
    if (!birthCity || !isLivedFormValid(rows, latestCompleteYear)) {
      return
    }

    setGenerating(true)
    setError(null)

    try {
      const data = await fetchMonthlyDelta(
        birthCity,
        birthYear,
        rowsToLivedCities(rows, latestCompleteYear),
      )
      setResult(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not generate your kundli. Is the API running on port 8787?',
      )
    } finally {
      setGenerating(false)
    }
  }

  const handleReset = () => {
    setResult(null)
    setError(null)
    setStep('birth')
  }

  if (result) {
    return (
      <WizardLayout scrollContent>
        <MonthlyDeltaChart data={result} onReset={handleReset} />
      </WizardLayout>
    )
  }

  return (
    <WizardLayout
      footer={
        step === 'lived' ? (
          <LivedCitiesStepFooter
            onBack={() => setStep('birth')}
            onGenerate={handleGenerate}
            generating={generating}
            canGenerate={isLivedFormValid(rows, latestCompleteYear)}
            generateDisabledReason={generateKundliDisabledReason(rows, latestCompleteYear)}
          />
        ) : null
      }
    >
      {step === 'birth' ? (
        <BirthStep
          birthCity={birthCity}
          onBirthCityChange={setBirthCity}
          birthYear={birthYear}
          onBirthYearChange={setBirthYear}
          latestCompleteYear={latestCompleteYear}
          onNext={goToLived}
        />
      ) : (
        <LivedCitiesStep
          birthYear={birthYear}
          rows={rows}
          onRowsChange={(next) => {
            setRows(next)
            if (!isLivedFormValid(next, latestCompleteYear)) {
              setError(null)
            }
          }}
          latestCompleteYear={latestCompleteYear}
          error={error}
        />
      )}
    </WizardLayout>
  )
}
