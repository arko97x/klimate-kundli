import { useMemo } from 'react'

import type { RainfallInsight } from '@/lib/api'
import { formatDataSource } from '@/lib/utils'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

function monthName(index: number): string {
  return MONTH_NAMES[index] ?? 'Unknown'
}

const COLOR_THEN = '#6b9eb8'
const COLOR_NOW = '#2a6f97'
const COLOR_DELTA = '#90c4e8'
const COLOR_THEN_RANGE = '#6b9eb8'
const COLOR_NOW_RANGE = '#2a6f97'

const VIEWBOX_WIDTH = 840
const VIEWBOX_HEIGHT = 420
const MARGIN = { top: 32, right: 32, bottom: 56, left: 56 }
const INNER_WIDTH = VIEWBOX_WIDTH - MARGIN.left - MARGIN.right
const INNER_HEIGHT = VIEWBOX_HEIGHT - MARGIN.top - MARGIN.bottom
const RANGE_BAR_WIDTH = 6
const RANGE_BAR_OFFSET = 5

type ChartPoint = { x: number; y: number; value: number; month: number }

type MonthlyRainSectionProps = {
  cityName: string
  rainfall: RainfallInsight
  source: string
  confidence: string
}

export function MonthlyRainSection({ cityName, rainfall, source, confidence }: MonthlyRainSectionProps) {
  const geometry = useMemo(() => buildRainGeometry(rainfall), [rainfall])
  const headline = buildRainHeadline(cityName, rainfall)

  return (
    <section className="space-y-6">
      <header className="space-y-2 text-center sm:text-left">
        <p className="text-sm text-muted-foreground">Water sign</p>
        <h3 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {headline.main}
        </h3>
        <p className="mx-auto max-w-2xl text-pretty text-muted-foreground sm:mx-0 sm:text-lg">
          {headline.sub}
        </p>
      </header>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Monthly rainfall in ${cityName}, ${rainfall.birthWindow.startYear}–${rainfall.birthWindow.endYear} versus ${rainfall.recentWindow.startYear}–${rainfall.recentWindow.endYear}.`}
        >
          <defs>
            <linearGradient id="rainThenArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={COLOR_THEN} stopOpacity={0.35} />
              <stop offset="100%" stopColor={COLOR_THEN} stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="rainNowArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={COLOR_NOW} stopOpacity={0.4} />
              <stop offset="100%" stopColor={COLOR_NOW} stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="rainDeltaBand" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={COLOR_DELTA} stopOpacity={0.5} />
              <stop offset="100%" stopColor={COLOR_DELTA} stopOpacity={0.15} />
            </linearGradient>
          </defs>

          <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
            <YAxis ticks={geometry.yTicks} />

            {geometry.birthRangeBars.map((bar) => (
              <rect
                key={`br-${bar.month}`}
                x={bar.x}
                y={bar.yTop}
                width={RANGE_BAR_WIDTH}
                height={bar.height}
                rx={2}
                fill={COLOR_THEN_RANGE}
                opacity={0.45}
              />
            ))}
            {geometry.recentRangeBars.map((bar) => (
              <rect
                key={`rr-${bar.month}`}
                x={bar.x}
                y={bar.yTop}
                width={RANGE_BAR_WIDTH}
                height={bar.height}
                rx={2}
                fill={COLOR_NOW_RANGE}
                opacity={0.5}
              />
            ))}

            {geometry.deltaSegments.map((path, i) => (
              <path key={`d-${i}`} d={path} fill="url(#rainDeltaBand)" />
            ))}
            {geometry.birthAreaSegments.map((path, i) => (
              <path key={`ba-${i}`} d={path} fill="url(#rainThenArea)" />
            ))}
            {geometry.recentAreaSegments.map((path, i) => (
              <path key={`ra-${i}`} d={path} fill="url(#rainNowArea)" />
            ))}
            {geometry.birthLineSegments.map((path, i) => (
              <path
                key={`bl-${i}`}
                d={path}
                fill="none"
                stroke={COLOR_THEN}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {geometry.recentLineSegments.map((path, i) => (
              <path
                key={`rl-${i}`}
                d={path}
                fill="none"
                stroke={COLOR_NOW}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {geometry.birthPoints.map((point) => (
              <circle key={`bp-${point.month}`} cx={point.x} cy={point.y} r={3} fill={COLOR_THEN} />
            ))}
            {geometry.recentPoints.map((point) => (
              <circle key={`rp-${point.month}`} cx={point.x} cy={point.y} r={3.2} fill={COLOR_NOW} />
            ))}

            <XAxis />

            {geometry.callout ? <Callout {...geometry.callout} /> : null}
          </g>
        </svg>
      </div>

      <footer>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <LegendSwatch
            color={COLOR_THEN}
            label={`Then · ${rainfall.birthWindow.startYear}–${rainfall.birthWindow.endYear}`}
          />
          <LegendSwatch
            color={COLOR_NOW}
            label={`Now · ${rainfall.recentWindow.startYear}–${rainfall.recentWindow.endYear}`}
          />
          <span className="text-xs text-muted-foreground">
            mm per month (avg) · bars = wettest–driest year in each window
          </span>
          <span className="text-xs uppercase tracking-wider opacity-70">
            {formatDataSource(source)} · {confidence}
          </span>
        </dl>
      </footer>
    </section>
  )
}

function buildRainHeadline(cityName: string, rain: RainfallInsight): { main: string; sub: string } {
  const thenRange = `${rain.birthWindow.startYear}–${rain.birthWindow.endYear}`
  const thresh = rain.heavyRainThresholdMm
  const deltaDays = rain.deltaDaysPerYear

  if (deltaDays >= 0.5) {
    return {
      main: 'The rain gods turned heavy-handed.',
      sub: `${cityName} now averages about ${rain.nowDaysPerYear.toFixed(1)} days per year with ${thresh}mm+ rain — up from ${rain.thenDaysPerYear.toFixed(1)} during ${thenRange}. Same calendar, harder hits.`,
    }
  }

  if (deltaDays <= -0.5) {
    return {
      main: 'The cloudburst omens softened.',
      sub: `${cityName} sees about ${Math.abs(deltaDays).toFixed(1)} fewer ${thresh}mm+ days per year than during ${thenRange}.`,
    }
  }

  if (rain.monsoonPctChange != null && Math.abs(rain.monsoonPctChange) >= 5) {
    const dir = rain.monsoonPctChange > 0 ? 'wetter' : 'drier'
    return {
      main: `The monsoon rewrote your fate line.`,
      sub: `June–September rainfall at ${cityName} is about ${Math.abs(rain.monsoonPctChange).toFixed(0)}% ${dir} now than during ${thenRange}.`,
    }
  }

  if (rain.largestDelta) {
    const { month, delta } = rain.largestDelta
    const label = monthName(month)
    const sign = delta >= 0 ? '+' : ''
    return {
      main: `${cityName}'s rains no longer keep their old vows.`,
      sub: `Biggest shift: ${label} averages ${sign}${delta.toFixed(0)}mm more rain per month now than during ${thenRange}.`,
    }
  }

  return {
    main: `${cityName}, wetter seasons in the data.`,
    sub: `Monthly rainfall around your birth years compared with the last five years.`,
  }
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="block size-3 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
      <span>{label}</span>
    </span>
  )
}

function YAxis({ ticks }: { ticks: { value: number; y: number }[] }) {
  return (
    <g aria-hidden>
      {ticks.map((tick) => (
        <g key={tick.value} transform={`translate(0, ${tick.y})`}>
          <line x1={0} x2={INNER_WIDTH} stroke="currentColor" strokeOpacity={0.08} />
          <text x={-12} y={4} textAnchor="end" fontSize={11} className="fill-muted-foreground tabular-nums">
            {tick.value}
          </text>
        </g>
      ))}
    </g>
  )
}

function XAxis() {
  return (
    <g transform={`translate(0, ${INNER_HEIGHT})`} aria-hidden>
      {MONTH_NAMES.map((label, i) => {
        const x = (i / 11) * INNER_WIDTH
        return (
          <text
            key={label}
            x={x}
            y={24}
            textAnchor="middle"
            fontSize={9}
            className="fill-muted-foreground"
          >
            {label}
          </text>
        )
      })}
    </g>
  )
}

interface CalloutProps {
  x: number
  yTop: number
  yBottom: number
  label: string
  sublabel: string
  side: 'left' | 'right'
}

function Callout({ x, yTop, yBottom, label, sublabel, side }: CalloutProps) {
  const offset = 18
  const textX = side === 'right' ? x + offset : x - offset
  const anchor = side === 'right' ? 'start' : 'end'

  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={Math.max(0, yTop - 6)}
        y2={Math.min(INNER_HEIGHT, yBottom + 6)}
        stroke={COLOR_DELTA}
        strokeWidth={1.25}
        strokeDasharray="3 3"
      />
      <circle cx={x} cy={yTop} r={4.5} fill="none" stroke={COLOR_NOW} strokeWidth={1.6} />
      <circle cx={x} cy={yBottom} r={4.5} fill="none" stroke={COLOR_THEN} strokeWidth={1.6} />
      <text
        x={textX}
        y={(yTop + yBottom) / 2 - 6}
        textAnchor={anchor}
        fontSize={13}
        fontWeight={600}
        className="fill-foreground"
      >
        {label}
      </text>
      <text
        x={textX}
        y={(yTop + yBottom) / 2 + 10}
        textAnchor={anchor}
        fontSize={11}
        className="fill-muted-foreground"
      >
        {sublabel}
      </text>
    </g>
  )
}

type RangeBar = { month: number; x: number; yTop: number; height: number }

interface Geometry {
  yTicks: { value: number; y: number }[]
  birthPoints: ChartPoint[]
  recentPoints: ChartPoint[]
  birthRangeBars: RangeBar[]
  recentRangeBars: RangeBar[]
  birthLineSegments: string[]
  recentLineSegments: string[]
  birthAreaSegments: string[]
  recentAreaSegments: string[]
  deltaSegments: string[]
  callout: CalloutProps | null
}

function buildRainGeometry(rain: RainfallInsight): Geometry {
  const birth = rain.birthWindow.monthly
  const recent = rain.recentWindow.monthly
  const birthMin = rain.birthWindow.monthlyMin ?? []
  const birthMax = rain.birthWindow.monthlyMax ?? []
  const recentMin = rain.recentWindow.monthlyMin ?? []
  const recentMax = rain.recentWindow.monthlyMax ?? []

  const allValues = [...birth, ...recent, ...birthMin, ...birthMax, ...recentMin, ...recentMax].filter(
    (v): v is number => v != null,
  )
  if (allValues.length === 0) {
    return emptyGeometry()
  }

  const dataMax = Math.max(...allValues)
  const yMin = 0
  const yMax = Math.ceil(dataMax * 1.1 + 10)

  const yScale = (value: number) => INNER_HEIGHT - ((value - yMin) / (yMax - yMin)) * INNER_HEIGHT
  const xScale = (monthIndex: number) => (monthIndex / 11) * INNER_WIDTH

  const birthPoints = buildPoints(birth, xScale, yScale)
  const recentPoints = buildPoints(recent, xScale, yScale)
  const birthRangeBars = buildRangeBars(birthMin, birthMax, -RANGE_BAR_OFFSET, xScale, yScale)
  const recentRangeBars = buildRangeBars(recentMin, recentMax, RANGE_BAR_OFFSET, xScale, yScale)

  const callout: CalloutProps | null = rain.largestDelta
    ? (() => {
        const m = rain.largestDelta.month
        const b = birth[m]
        const r = recent[m]
        if (b == null || r == null) return null
        const delta = rain.largestDelta.delta
        const sign = delta >= 0 ? '+' : ''
        const direction = delta >= 0 ? 'wetter' : 'drier'
        const yRecent = yScale(r)
        const yBirth = yScale(b)
        const side: 'left' | 'right' = m >= 8 ? 'left' : 'right'
        return {
          x: xScale(m),
          yTop: Math.min(yRecent, yBirth),
          yBottom: Math.max(yRecent, yBirth),
          label: `${sign}${delta.toFixed(0)}mm`,
          sublabel: `${monthName(m)} is now ${direction}`,
          side,
        }
      })()
    : null

  return {
    yTicks: computeYTicks(yMin, yMax).map((value) => ({ value, y: yScale(value) })),
    birthPoints,
    recentPoints,
    birthRangeBars,
    recentRangeBars,
    birthLineSegments: buildLineSegments(birth, xScale, yScale),
    recentLineSegments: buildLineSegments(recent, xScale, yScale),
    birthAreaSegments: buildAreaSegments(birth, xScale, yScale),
    recentAreaSegments: buildAreaSegments(recent, xScale, yScale),
    deltaSegments: buildDeltaSegments(birth, recent, xScale, yScale),
    callout,
  }
}

function emptyGeometry(): Geometry {
  return {
    yTicks: [],
    birthPoints: [],
    recentPoints: [],
    birthRangeBars: [],
    recentRangeBars: [],
    birthLineSegments: [],
    recentLineSegments: [],
    birthAreaSegments: [],
    recentAreaSegments: [],
    deltaSegments: [],
    callout: null,
  }
}

function buildPoints(
  monthly: (number | null)[],
  xScale: (m: number) => number,
  yScale: (v: number) => number,
): ChartPoint[] {
  const points: ChartPoint[] = []
  for (let m = 0; m < monthly.length; m += 1) {
    const v = monthly[m]
    if (v == null) continue
    points.push({ x: xScale(m), y: yScale(v), value: v, month: m })
  }
  return points
}

function buildRangeBars(
  mins: (number | null)[],
  maxs: (number | null)[],
  xOffset: number,
  xScale: (m: number) => number,
  yScale: (v: number) => number,
): RangeBar[] {
  const bars: RangeBar[] = []
  for (let m = 0; m < 12; m += 1) {
    const lo = mins[m]
    const hi = maxs[m]
    if (lo == null || hi == null) continue
    const yTop = yScale(Math.max(lo, hi))
    const yBottom = yScale(Math.min(lo, hi))
    bars.push({
      month: m,
      x: xScale(m) + xOffset - RANGE_BAR_WIDTH / 2,
      yTop,
      height: Math.max(2, yBottom - yTop),
    })
  }
  return bars
}

function buildLineSegments(
  monthly: (number | null)[],
  xScale: (m: number) => number,
  yScale: (v: number) => number,
): string[] {
  const segments: string[] = []
  let current = ''
  for (let m = 0; m < monthly.length; m += 1) {
    const v = monthly[m]
    if (v == null) {
      if (current) segments.push(current)
      current = ''
      continue
    }
    const cmd = current ? 'L' : 'M'
    current += `${cmd}${xScale(m)},${yScale(v)} `
  }
  if (current) segments.push(current)
  return segments
}

function buildAreaSegments(
  monthly: (number | null)[],
  xScale: (m: number) => number,
  yScale: (v: number) => number,
): string[] {
  const segments: string[] = []
  let current: ChartPoint[] = []
  const flush = () => {
    if (current.length < 2) {
      current = []
      return
    }
    const first = current[0]!
    const last = current[current.length - 1]!
    let d = `M${first.x},${INNER_HEIGHT} `
    for (const p of current) {
      d += `L${p.x},${p.y} `
    }
    d += `L${last.x},${INNER_HEIGHT} Z`
    segments.push(d)
    current = []
  }
  for (let m = 0; m < monthly.length; m += 1) {
    const v = monthly[m]
    if (v == null) {
      flush()
      continue
    }
    current.push({ x: xScale(m), y: yScale(v), value: v, month: m })
  }
  flush()
  return segments
}

function buildDeltaSegments(
  birth: (number | null)[],
  recent: (number | null)[],
  xScale: (m: number) => number,
  yScale: (v: number) => number,
): string[] {
  const segments: string[] = []
  let polygon: { x: number; yRecent: number; yBirth: number }[] = []
  const flush = () => {
    if (polygon.length < 2) {
      polygon = []
      return
    }
    let top = `M${polygon[0]!.x},${polygon[0]!.yRecent} `
    for (let i = 1; i < polygon.length; i += 1) {
      top += `L${polygon[i]!.x},${polygon[i]!.yRecent} `
    }
    for (let i = polygon.length - 1; i >= 0; i -= 1) {
      top += `L${polygon[i]!.x},${polygon[i]!.yBirth} `
    }
    top += 'Z'
    segments.push(top)
    polygon = []
  }
  for (let m = 0; m < 12; m += 1) {
    const b = birth[m]
    const r = recent[m]
    if (b == null || r == null) {
      flush()
      continue
    }
    polygon.push({ x: xScale(m), yRecent: yScale(r), yBirth: yScale(b) })
  }
  flush()
  return segments
}

function computeYTicks(yMin: number, yMax: number): number[] {
  const range = yMax - yMin
  if (range <= 0) return [yMin]
  const step = niceStep(range / 5)
  const start = Math.ceil(yMin / step) * step
  const ticks: number[] = []
  for (let v = start; v <= yMax; v += step) {
    ticks.push(Math.round(v))
  }
  return ticks
}

function niceStep(rough: number): number {
  if (rough <= 1) return 1
  if (rough <= 2) return 2
  if (rough <= 2.5) return 2
  if (rough <= 5) return 5
  if (rough <= 10) return 10
  if (rough <= 25) return 25
  if (rough <= 50) return 50
  return 100
}
