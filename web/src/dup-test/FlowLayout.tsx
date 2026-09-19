import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { LinenPaper } from '@/components/LinenPaper'
import { cn } from '@/lib/utils'

import { CreaseLines } from './CreaseLines'
import { FillingParrot } from './FillingParrot'
import { TWINKLE_CSS } from './twinkle'
import { BASE, STEPS, firstIncompleteStep, stepIndex, stepPath, type StepKey } from './flow'
import { useFlow } from './FlowProvider'

// Screen entry: fast fade plus a small rise, removed for reduced motion.
const FLOW_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Almendra+SC&display=swap');
@keyframes dup-enter { from { opacity: 0; transform: translateY(6px); } }
.dup-enter { animation: dup-enter 220ms cubic-bezier(0.2, 0.8, 0.2, 1); }
@media (prefers-reduced-motion: reduce) { .dup-enter { animation: none; } }
@media (max-width: 639px), (max-height: 500px) { .dup-actions { animation: none; } }
`

function currentStep(pathname: string): StepKey | 'done' | null {
  const segment = pathname.slice(BASE.length + 1).split('/')[0]
  if (segment === 'done') return 'done'
  return STEPS.some((s) => s.key === segment) ? (segment as StepKey) : null
}

export function FlowLayout() {
  const { pathname } = useLocation()
  const step = currentStep(pathname)
  // The crystal ball fills as the visitor goes, rising smoothly between steps.
  const ballLevel =
    step === 'photo' ? 0.2 : step === 'birth' ? 0.35 : step === 'places' || step === 'done' ? 0.85 : 0

  return (
    // isolate: lets CreaseLines sit at -z-10 above the paper but under content.
    <LinenPaper className="relative isolate min-h-svh">
      <style>{FLOW_CSS + TWINKLE_CSS}</style>
      <CreaseLines />
      <a
        href="#flow-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-black focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to question
      </a>

      <header className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:pt-8 [@media(max-height:500px)]:pt-3">
        <Link
          to={BASE}
          className="w-fit text-2xl uppercase leading-none tracking-wide text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
          style={{ fontFamily: "'Almendra SC', serif" }}
        >
          Klimate Kundli
        </Link>
        {step && step !== 'done' && <Stepper current={step} />}
      </header>

      <main
        id="flow-main"
        // Extra bottom padding on phones and short screens clears the fixed
        // action bar (see StepShell), so nothing ends up hidden behind it.
        className="mx-auto w-full max-w-xl px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-10 max-sm:pb-40 sm:pt-16 [@media(max-height:500px)]:pb-32 [@media(max-height:500px)]:pt-5"
      >
        <Outlet />
      </main>

      <FillingParrot
        level={ballLevel}
        className="pointer-events-none absolute bottom-6 right-6 hidden w-[140px] mix-blend-multiply xl:block"
      />
    </LinenPaper>
  )
}

function Stepper({ current }: { current: StepKey }) {
  const { state } = useFlow()
  const navigate = useNavigate()
  const currentIdx = stepIndex(current)
  const first = firstIncompleteStep(state)
  const reachableUpTo = first ? stepIndex(first) : STEPS.length - 1

  return (
    <nav aria-label="Progress">
      <ol className="flex items-center">
        {STEPS.map((s, i) => {
          const done = first === null || i < stepIndex(first)
          const isCurrent = i === currentIdx
          const reachable = i <= reachableUpTo && !isCurrent
          return (
            <li key={s.key} className="flex items-center">
              {i > 0 && (
                <span aria-hidden className={cn('mx-1.5 h-px w-5 sm:mx-2 sm:w-8', done || isCurrent ? 'bg-black' : 'bg-neutral-300')} />
              )}
              <button
                type="button"
                disabled={!reachable}
                onClick={() => navigate(stepPath(s.key, state))}
                aria-current={isCurrent ? 'step' : undefined}
                className="group flex min-h-11 touch-manipulation items-center gap-2 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              >
                <Diamond state={isCurrent ? 'current' : done ? 'done' : 'todo'}>{done && !isCurrent ? '✓' : i + 1}</Diamond>
                <span
                  className={cn(
                    'text-sm',
                    isCurrent ? 'text-black' : 'sr-only text-neutral-600 sm:not-sr-only',
                    reachable && 'group-hover:underline group-hover:underline-offset-4',
                  )}
                >
                  {s.label}
                  <span className="sr-only">{isCurrent ? ' (current step)' : done ? ' (done)' : ''}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function Diamond({ state, children }: { state: 'current' | 'done' | 'todo'; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-7 shrink-0 rotate-45 place-items-center border',
        state === 'current' && 'border-transparent bg-gradient-to-b from-[#180033] to-[#bd005d] text-white',
        state === 'done' && 'border-black bg-black text-white',
        state === 'todo' && 'border-neutral-400 text-neutral-500',
      )}
    >
      <span className="-rotate-45 text-xs font-semibold">{children}</span>
    </span>
  )
}

/** Sends a visitor who deep-links past an unfinished step back to it. */
export function StepGuard({ step, children }: { step: StepKey; children: ReactNode }) {
  const { state } = useFlow()
  const first = firstIncompleteStep(state)
  if (first && stepIndex(step) > stepIndex(first)) {
    return <Navigate to={stepPath(first, state)} replace />
  }
  return children
}
