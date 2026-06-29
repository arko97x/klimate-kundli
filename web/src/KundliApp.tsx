import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { BirthStep } from '@/components/BirthStep'
import { LivedCitiesStep } from '@/components/LivedCitiesStep'
import { defaultBirthYear } from '@/components/BirthYearPicker'
import { Footer } from '@/expt/Footer'
import { KundliWizardLayout } from '@/expt/KundliWizardLayout'
import { fetchMonthlyDelta, saveKundli } from '@/lib/api'
import {
  createInitialRows,
  generateKundliDisabledReason,
  isLivedFormValid,
  rowsToLivedCities,
} from '@/lib/lived-cities'
import { addMyKundliSlug } from '@/lib/my-kundlis'
import { latestCompleteYearUtc, MIN_BIRTH_YEAR } from '@/lib/years'
import type { City, ResidenceRow } from '@/types'
import { useIsExhibition } from '@/lib/exhibition-context'

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
  const navigate = useNavigate()
  const isExhibition = useIsExhibition()
  const latestCompleteYear = useMemo(() => latestCompleteYearUtc(), [])
  const [step, setStep] = useState<Step>('birth')
  const [birthCity, setBirthCity] = useState<City | null>(null)
  const [birthYear, setBirthYear] = useState(initialBirthYear)
  const [rows, setRows] = useState<ResidenceRow[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const goToLived = () => {
    if (!birthCity) {
      return
    }
    setRows(createInitialRows(birthCity, birthYear, latestCompleteYear))
    setStep('lived')
    setError(null)
  }

  const handleGenerate = async () => {
    if (!birthCity || !isLivedFormValid(rows, latestCompleteYear)) {
      return
    }

    setGenerating(true)
    setError(null)

    try {
      const livedCities = rowsToLivedCities(rows, latestCompleteYear)
      const result = await fetchMonthlyDelta(birthCity, birthYear, livedCities)
      const saved = await saveKundli({
        birthCity,
        birthYear,
        livedCities,
        result,
      })
      addMyKundliSlug(saved.slug)
      navigate(isExhibition ? `/exhibition/k/${saved.slug}` : `/k/${saved.slug}`)
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

  return (
    <KundliWizardLayout
      footer={
        step === 'birth' ? (
          <Footer
            mode="continue"
            canContinue={birthCity !== null}
            onNext={goToLived}
          />
        ) : (
          <Footer
            mode="generate"
            onBack={() => setStep('birth')}
            onGenerate={handleGenerate}
            generating={generating}
            canGenerate={isLivedFormValid(rows, latestCompleteYear)}
            generateDisabledReason={generateKundliDisabledReason(rows, latestCompleteYear)}
          />
        )
      }
    >
      {step === 'birth' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-6 pr-0">
          <BirthStep
            birthCity={birthCity}
            onBirthCityChange={setBirthCity}
            birthYear={birthYear}
            onBirthYearChange={setBirthYear}
            latestCompleteYear={latestCompleteYear}
            showContinue={false}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 pr-0 pb-0">
          <LivedCitiesStep
            embedded
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
        </div>
      )}
    </KundliWizardLayout>
  )
}
