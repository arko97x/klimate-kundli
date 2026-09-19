import { useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { fetchMonthlyDelta } from '@/lib/api'
import type { City } from '@/types'

import { BASE, placesPath, type FlowState } from './flow'
import { useFlow } from './FlowProvider'
import { CityField, YearField } from './fields'
import { isCompleteMove, moveYearBounds, movesToLivedCities, type MoveEvent } from './journey'
import { Panel, PrimaryButton, SecondaryButton, StepShell, TextButton } from './ui'

// Step 4 is a short loop of one-question screens (see
// docs/EXPERIENCE_REDESIGN_HANDOFF.md): did you move? → where? → when? →
// again? → review. URLs: /places/move/:n, /places/move/:n/city,
// /places/move/:n/year, /places/review. `?from=review` returns an edit to review.

const EYEBROW = 'Step 4 of 4'
const P = `${BASE}/places`

type Part = 'question' | 'city' | 'year'

/** Where to send a visitor whose URL points past what they've answered. */
function placeRedirect(state: FlowState, n: number, part: Part): string | null {
  const resume = placesPath(state)
  if (!Number.isInteger(n) || n < 1 || n > state.moves.length + 1) return resume
  const earlierIncomplete = state.moves.slice(0, n - 1).some((m) => !isCompleteMove(m))
  if (earlierIncomplete) return resume
  if (part === 'year' && !state.moves[n - 1]?.city) return `${P}/move/${n}/city`
  return null
}

/** The stop a move leaves from: the birth city, or the previous move. */
function previousStop(state: FlowState, n: number): { city: City; year: number } {
  if (n === 1) return { city: state.birthCity!, year: state.birthYear! }
  const prev = state.moves[n - 2]
  return { city: prev.city!, year: prev.year! }
}

function useMoveNumber(): number {
  return Number(useParams().n)
}

function sameCity(a: City, b: City): boolean {
  return a.lat === b.lat && a.lon === b.lon
}

export function PlacesIndex() {
  const { state } = useFlow()
  return <Navigate to={placesPath(state)} replace />
}

export function MoveQuestion() {
  const { state, latestYear, setMoves } = useFlow()
  const navigate = useNavigate()
  const n = useMoveNumber()
  const redirect = placeRedirect(state, n, 'question')
  if (redirect) return <Navigate to={redirect} replace />

  const prev = previousStop(state, n)
  const noRoom = prev.year >= latestYear
  const laterMoves = state.moves.length - (n - 1)

  const stay = () => {
    setMoves(state.moves.slice(0, n - 1), true)
    navigate(`${P}/review`)
  }

  return (
    <StepShell
      eyebrow={EYEBROW}
      title={n === 1 ? `Did you move away from ${prev.city.name}?` : `Did you move again after ${prev.city.name}?`}
      helper={
        noRoom
          ? `${prev.year} is the most recent full year on record, so there's nothing after it to add.`
          : 'Count the places that became home, not holidays or short trips.'
      }
      back={
        <SecondaryButton onClick={() => navigate(n === 1 ? `${BASE}/birth` : `${P}/move/${n - 1}/year`)}>
          ← Back
        </SecondaryButton>
      }
    >
      <div className="flex flex-col gap-3">
        {!noRoom && (
          <PrimaryButton className="w-full" onClick={() => navigate(`${P}/move/${n}/city`)}>
            {n === 1 ? 'Yes, I moved' : 'Yes, one more move'}
          </PrimaryButton>
        )}
        <SecondaryButton className="w-full" onClick={stay}>
          {n === 1 ? `No, I've always lived in ${prev.city.name}` : `No, I still live in ${prev.city.name}`}
        </SecondaryButton>
        {laterMoves > 0 && (
          <p className="text-sm text-neutral-600">
            Choosing “No” removes the {laterMoves === 1 ? 'move' : `${laterMoves} moves`} you added after this.
          </p>
        )}
      </div>
    </StepShell>
  )
}

export function MoveCity() {
  const { state, setMoves } = useFlow()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromReview = params.get('from') === 'review'
  const n = useMoveNumber()
  const redirect = placeRedirect(state, n, 'city')
  if (redirect) return <Navigate to={redirect} replace />

  const prev = previousStop(state, n)
  const move = state.moves[n - 1]
  const city = move?.city ?? null
  const repeat = city !== null && sameCity(city, prev.city)

  const onChange = (next: City | null) => {
    const moves = [...state.moves]
    if (next === null && move && move.year === null && n === moves.length) moves.pop()
    else if (move) moves[n - 1] = { ...move, city: next }
    else if (next) moves.push({ city: next, year: null })
    setMoves(moves)
  }

  const onNext = () => {
    if (fromReview && move?.year != null) navigate(`${P}/review`)
    else navigate(`${P}/move/${n}/year${fromReview ? '?from=review' : ''}`)
  }

  return (
    <StepShell
      eyebrow={EYEBROW}
      title={fromReview && move ? `Change the city for move ${n}` : 'Where did you move next?'}
      helper={`After ${prev.city.name}. Pick the city that became home.`}
      back={
        <SecondaryButton onClick={() => navigate(fromReview ? `${P}/review` : `${P}/move/${n}`)}>← Back</SecondaryButton>
      }
      primary={
        <PrimaryButton disabled={!city || repeat} onClick={onNext}>
          Next →
        </PrimaryButton>
      }
      blockedReason={!city ? 'Choose a city.' : repeat ? `That's ${prev.city.name}, where you were already living.` : null}
    >
      <Panel>
        <CityField label="City" value={city} onChange={onChange} placeholder="Search for a city" />
      </Panel>
    </StepShell>
  )
}

export function MoveYear() {
  const { state, latestYear, setMoves } = useFlow()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromReview = params.get('from') === 'review'
  const n = useMoveNumber()
  const redirect = placeRedirect(state, n, 'year')
  if (redirect) return <Navigate to={redirect} replace />

  const move = state.moves[n - 1]
  const { min, max } = moveYearBounds(n - 1, state.birthYear!, state.moves, latestYear)

  const onChange = (year: number | null) => {
    const moves: MoveEvent[] = [...state.moves]
    moves[n - 1] = { ...move, year }
    setMoves(moves)
  }

  return (
    <StepShell
      eyebrow={EYEBROW}
      title={`When did ${move.city!.name} become home?`}
      helper="An approximate year is fine."
      back={
        <SecondaryButton onClick={() => navigate(`${P}/move/${n}/city${fromReview ? '?from=review' : ''}`)}>
          ← Back
        </SecondaryButton>
      }
      primary={
        <PrimaryButton
          disabled={move.year === null}
          onClick={() => navigate(fromReview ? `${P}/review` : `${P}/move/${n + 1}`)}
        >
          Next →
        </PrimaryButton>
      }
      blockedReason={move.year === null ? 'Choose a year.' : null}
    >
      <Panel>
        <YearField
          label="Year you moved"
          value={move.year}
          onChange={onChange}
          min={min}
          max={max}
          ageFrom={state.birthYear!}
          helper={`Between ${min} and ${max}.`}
        />
      </Panel>
    </StepShell>
  )
}

export function Review() {
  const { state, latestYear, setMoves, setResult } = useFlow()
  const navigate = useNavigate()
  const [confirmClear, setConfirmClear] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (placesPath(state) !== `${P}/review`) return <Navigate to={placesPath(state)} replace />

  const birthCity = state.birthCity!
  const birthYear = state.birthYear!
  const moves = state.moves.filter(isCompleteMove)
  const stops = [{ city: birthCity, year: birthYear }, ...moves]
  const lastYear = stops[stops.length - 1].year
  const canAdd = lastYear < latestYear

  const removeMove = (i: number) => setMoves(state.moves.filter((_, j) => j !== i))

  const generate = async () => {
    setGenerating(true)
    setError(null)
    try {
      // Test route: compute the kundli to prove the journey works, but skip
      // saveKundli so nothing lands in the shared store or gallery.
      const result = await fetchMonthlyDelta(birthCity, birthYear, movesToLivedCities(birthCity, birthYear, moves))
      setResult(result)
      navigate(`${BASE}/done`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read your climate. Try again.')
      setGenerating(false)
    }
  }

  return (
    <StepShell
      eyebrow={EYEBROW}
      title="Does this journey look right?"
      helper="Each place runs until the year you moved on. Change anything before we read your climate."
      back={<SecondaryButton onClick={() => navigate(`${P}/move/${state.moves.length + 1}`)}>← Back</SecondaryButton>}
      primary={
        <PrimaryButton disabled={generating} onClick={generate}>
          {generating ? 'Reading your climate…' : 'Generate my kundli'}
        </PrimaryButton>
      }
    >
      <ol className="flex flex-col border-t border-neutral-300">
        {stops.map((stop, i) => {
          const next = stops[i + 1]
          const moveIndex = i - 1
          return (
            <li key={`${stop.city.lat},${stop.city.lon},${stop.year}`} className="flex flex-col gap-1 border-b border-neutral-300 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-lg text-black">{stop.city.displayName}</p>
                <p className="shrink-0 text-sm tabular-nums text-neutral-700">
                  <time dateTime={String(stop.year)}>{stop.year}</time>
                  {' – '}
                  {next ? <time dateTime={String(next.year - 1)}>{next.year - 1}</time> : 'now'}
                </p>
              </div>
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
                {i === 0 ? 'Born here' : `Move ${i}`}
              </p>
              <div className="flex flex-wrap gap-x-5">
                {i === 0 ? (
                  <TextButton onClick={() => navigate(`${BASE}/birth`)}>Change birth city or year</TextButton>
                ) : (
                  <>
                    <TextButton onClick={() => navigate(`${P}/move/${i}/city?from=review`)}>Change city</TextButton>
                    <TextButton onClick={() => navigate(`${P}/move/${i}/year?from=review`)}>Change year</TextButton>
                    <TextButton onClick={() => removeMove(moveIndex)}>
                      Remove<span className="sr-only"> {stop.city.name}</span>
                    </TextButton>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-col gap-2">
        <SecondaryButton
          className="w-full"
          disabled={!canAdd}
          onClick={() => navigate(`${P}/move/${state.moves.length + 1}/city?from=review`)}
        >
          + Add another move
        </SecondaryButton>
        {!canAdd && (
          <p className="text-sm text-neutral-600">
            Your last move is in {latestYear}, the most recent full year, so there's no room for another.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {confirmClear ? (
          <>
            <p className="text-sm text-black">Remove every move and start the journey again?</p>
            <SecondaryButton
              onClick={() => {
                setMoves([], false)
                navigate(`${P}/move/1`)
              }}
            >
              Yes, clear moves
            </SecondaryButton>
            <TextButton onClick={() => setConfirmClear(false)}>Cancel</TextButton>
          </>
        ) : (
          moves.length > 0 && <TextButton onClick={() => setConfirmClear(true)}>Clear all moves</TextButton>
        )}
      </div>

      <div aria-live="polite" className="text-sm">
        {generating && <p className="text-neutral-700">Reading decades of weather records. This can take a few seconds.</p>}
        {error && (
          <p role="alert" className="text-black">
            {error}
          </p>
        )}
      </div>
    </StepShell>
  )
}
