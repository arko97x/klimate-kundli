import { useNavigate } from 'react-router-dom'

import { MIN_BIRTH_YEAR } from '@/lib/years'

import { BASE, placesPath } from './flow'
import { useFlow } from './FlowProvider'
import { CityField, YearField } from './fields'
import { Panel, PrimaryButton, SecondaryButton, StepShell } from './ui'

export function BirthStep() {
  const { state, latestYear, setBirth } = useFlow()
  const navigate = useNavigate()
  const { birthCity, birthYear } = state

  const missing = !birthCity && birthYear === null
    ? 'Choose your birth city and year.'
    : !birthCity
      ? 'Choose your birth city.'
      : birthYear === null
        ? 'Choose your birth year.'
        : null

  return (
    <StepShell
      eyebrow="Step 3 of 4"
      title="Where did your climate story begin?"
      helper="The city you were born in, and the year."
      back={<SecondaryButton onClick={() => navigate(`${BASE}/photo`)}>← Back</SecondaryButton>}
      primary={
        <PrimaryButton disabled={missing !== null} onClick={() => navigate(placesPath(state))}>
          Next →
        </PrimaryButton>
      }
      blockedReason={missing}
    >
      <Panel className="flex flex-col gap-5">
        <CityField
          label="Birth city"
          value={birthCity}
          onChange={(city) => setBirth(city, birthYear)}
          placeholder="Search for a city"
        />
        <YearField
          label="Birth year"
          value={birthYear}
          onChange={(year) => setBirth(birthCity, year)}
          min={MIN_BIRTH_YEAR}
          max={latestYear}
          descending
        />
      </Panel>
    </StepShell>
  )
}
