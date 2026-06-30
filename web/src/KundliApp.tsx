import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { BirthStep } from '@/components/BirthStep'
import { LivedCitiesStep } from '@/components/LivedCitiesStep'
import { defaultBirthYear } from '@/components/BirthYearPicker'
import { KundliWizardLayout } from '@/expt/KundliWizardLayout'
import { fetchMonthlyDelta, saveKundli } from '@/lib/api'
import {
  createInitialRows,
  isLivedFormValid,
  rowsToLivedCities,
} from '@/lib/lived-cities'
import { addMyKundliSlug } from '@/lib/my-kundlis'
import { latestCompleteYearUtc, MIN_BIRTH_YEAR } from '@/lib/years'
import type { City, ResidenceRow } from '@/types'
import { useIsExhibition } from '@/lib/exhibition-context'

type Step = 'landing' | 'birth' | 'lived'

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
  const [step, setStep] = useState<Step>('landing')
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
      showLanding={step === 'landing'}
      onStart={() => setStep('birth')}
    >
      {step === 'birth' && (
        <BirthStep
          birthCity={birthCity}
          onBirthCityChange={setBirthCity}
          birthYear={birthYear}
          onBirthYearChange={setBirthYear}
          latestCompleteYear={latestCompleteYear}
          onNext={goToLived}
        />
      )}
      {step === 'lived' && (
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
          onBack={() => setStep('birth')}
          onGenerate={handleGenerate}
          generating={generating}
        />
      )}
    </KundliWizardLayout>
  )
}
