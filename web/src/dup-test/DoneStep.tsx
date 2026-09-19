import { Navigate, useNavigate } from 'react-router-dom'

import { BASE, firstIncompleteStep, stepPath } from './flow'
import { useFlow } from './FlowProvider'
import { Panel, PrimaryButton, StepShell } from './ui'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function DoneStep() {
  const { state, reset } = useFlow()
  const navigate = useNavigate()

  if (!state.result) {
    const first = firstIncompleteStep(state)
    return <Navigate to={first ? stepPath(first, state) : `${BASE}/places/review`} replace />
  }

  const { result, photo, linkedIn } = state
  const largest = result.largestDelta
  const handle = linkedIn?.replace('https://www.linkedin.com/in/', '')

  return (
    <StepShell
      title="Your kundli is ready"
      helper="This is a test route: the kundli was computed but not saved, and your LinkedIn and portrait stay in this browser tab."
      primary={
        <PrimaryButton
          onClick={() => {
            reset()
            navigate(BASE)
          }}
        >
          Start over
        </PrimaryButton>
      }
    >
      <Panel className="flex flex-wrap items-start gap-5">
        {photo && (
          <div className="aspect-[4/5] w-28 shrink-0 border border-black">
            <img src={photo} alt="Your dotted portrait" className="h-full w-full [image-rendering:pixelated]" />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-lg text-black">
            Born in {result.city.displayName}, {result.birthYear}
          </p>
          {handle && <p className="truncate text-sm text-neutral-600">linkedin.com/in/{handle}</p>}
          {largest && (
            <p className="mt-2 text-base leading-relaxed text-black">
              {MONTHS[largest.month]} has changed the most since you were born: it now runs{' '}
              <strong>
                {largest.delta > 0 ? '+' : '−'}
                {Math.abs(largest.delta).toFixed(1)}°C
              </strong>{' '}
              {largest.delta > 0 ? 'warmer' : 'cooler'}.
            </p>
          )}
        </div>
      </Panel>
    </StepShell>
  )
}
