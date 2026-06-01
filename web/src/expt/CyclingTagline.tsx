import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import './cycling-tagline.css'

const TAGLINES = [
  ['Your climate story,', 'interpreted.'],
  ['Sima Aunty matches people.', 'We match you to your climate.'],
  ['Monisha beta,', 'klimate kundli bolo.', '"Weather app" is just too middle class.'],
  ['Monisha beta,', 'janam patrika bolo.', '"What\'s the forecast?" is just too basic.'],
  ['Monisha beta,', 'graha dasha bolo.', '"Climate anxiety" is just too middle class.'],
  ['Monisha beta,', 'upaay bolo.', '"Turn on the AC" is just too basic.'],
] as const

const STAGGER_MS = 130
const ENTER_MS = 900
const LEAVE_MS = 800
const CROSSFADE_OVERLAP = 200
const DWELL_MS = 6000

function enterDuration(segmentCount: number) {
  return CROSSFADE_OVERLAP + (segmentCount - 1) * STAGGER_MS + ENTER_MS
}

type TaglineLayerProps = {
  segments: readonly string[]
  mode: 'enter' | 'leave' | 'static'
}

function TaglineLayer({ segments, mode }: TaglineLayerProps) {
  return (
    <div
      className={cn(
        'kk-tagline-layer',
        mode === 'enter' && 'kk-tagline-layer--enter',
        mode === 'leave' && 'kk-tagline-layer--leave',
      )}
      style={
        {
          '--kk-stagger-ms': `${STAGGER_MS}ms`,
          '--kk-enter-ms': `${ENTER_MS}ms`,
          '--kk-leave-ms': `${LEAVE_MS}ms`,
          '--kk-crossfade-overlap': `${CROSSFADE_OVERLAP}ms`,
        } as React.CSSProperties
      }
    >
      <p className="kk-tagline-copy w-full text-center font-heading text-base sm:text-lg">
        {segments.map((line, i) => (
          <span
            key={i}
            className="kk-tagline-line"
            style={{ '--line-index': i } as React.CSSProperties}
          >
            {i > 0 ? ' ' : ''}
            {line}
          </span>
        ))}
      </p>
    </div>
  )
}

export function CyclingTagline() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [leavingIndex, setLeavingIndex] = useState<number | null>(null)
  const [liveText, setLiveText] = useState(TAGLINES[0].join(' '))
  const reducedMotionRef = useRef(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )

  useEffect(() => {
    let cancelled = false
    const timers: number[] = []

    const schedule = (delay: number, fn: () => void) => {
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) fn()
        }, delay),
      )
    }

    const runCycle = (index: number) => {
      const reduced = reducedMotionRef.current
      const dwell = DWELL_MS

      schedule(dwell, () => {
        const nextIndex = (index + 1) % TAGLINES.length

        if (reduced) {
          setLeavingIndex(null)
          setCurrentIndex(nextIndex)
          setLiveText(TAGLINES[nextIndex].join(' '))
          runCycle(nextIndex)
          return
        }

        setLeavingIndex(index)
        setCurrentIndex(nextIndex)

        schedule(LEAVE_MS, () => {
          setLeavingIndex((prev) => (prev === index ? null : prev))
        })

        schedule(enterDuration(TAGLINES[nextIndex].length), () => {
          setLiveText(TAGLINES[nextIndex].join(' '))
        })

        runCycle(nextIndex)
      })
    }

    schedule(
      reducedMotionRef.current ? 0 : enterDuration(TAGLINES[0].length),
      () => setLiveText(TAGLINES[0].join(' ')),
    )
    runCycle(0)

    return () => {
      cancelled = true
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="kk-tagline-stage relative mt-5 w-full"
    >
      <p
        aria-hidden
        className="kk-tagline-sizer kk-tagline-copy text-center font-heading text-base sm:text-lg"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className="kk-tagline-sizer-line">
            &nbsp;
          </span>
        ))}
      </p>

      <div className="absolute inset-0">
        {leavingIndex !== null && (
          <TaglineLayer segments={TAGLINES[leavingIndex]} mode="leave" />
        )}
        <TaglineLayer
          key={currentIndex}
          segments={TAGLINES[currentIndex]}
          mode={reducedMotionRef.current ? 'static' : 'enter'}
        />
      </div>

      <span className="sr-only">{liveText}</span>
    </div>
  )
}
