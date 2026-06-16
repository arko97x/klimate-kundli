import { useMemo, useRef, useState } from 'react'

import type { RainRingsInsight } from '@/lib/api'
import { latestCompleteYearUtc } from '@/lib/years'
import type { LivedCity } from '@/types'

const SIZE = 420
const CENTER = SIZE / 2
const MIN_R = 52
const MAX_R = 168
const TICK_R = MAX_R + 10
const LABEL_R = MAX_R + 26

const COLOR_LINE = '#4a6f94'
const CITY_PALETTE = ['#6b8eb8', '#d3674a', '#5c8a6e', '#9a6b4a', '#7a5c8a', '#4a7a8a', '#b87a4a']
const GRID_LEVELS = [0.25, 0.5, 0.75, 1] as const

type LifeOrbitChartProps = {
  birthYear: number
  livedCities: LivedCity[]
  rainRings?: RainRingsInsight | null
  latestCompleteYear?: number
}

type YearPoint = {
  year: number
  angle: number
  radius: number
  precipMm: number
  displayName: string
  color: string
  x: number
  y: number
}

type LineSegment = {
  key: string
  d: string
  color: string
}

type RadialGeometry = {
  points: YearPoint[]
  linePath: string
  lineSegments: LineSegment[]
  gridCircles: { r: number; label: number }[]
  yearTicks: { year: number; x1: number; y1: number; x2: number; y2: number; lx: number; ly: number; anchor: 'start' | 'middle' | 'end' }[]
  legend: { displayName: string; color: string; years: number }[]
  valueMin: number
  valueMax: number
}

export function LifeOrbitChart({
  birthYear,
  livedCities,
  rainRings,
  latestCompleteYear = latestCompleteYearUtc(),
}: LifeOrbitChartProps) {
  const geometry = useMemo(
    () => buildRadialGeometry(birthYear, livedCities, rainRings, latestCompleteYear),
    [birthYear, livedCities, rainRings, latestCompleteYear],
  )

  if (geometry.points.length < 2) {
    return null
  }

  const headline = buildHeadline(geometry)

  return (
    <section className="space-y-6 pb-6">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Your orbit</p>
        <h3 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {headline.main}
        </h3>
        <p className="max-w-3xl text-pretty text-muted-foreground">{headline.sub}</p>
      </div>

      <RadialPanel geometry={geometry} birthYear={birthYear} latestCompleteYear={latestCompleteYear} />

      <ul className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {geometry.legend.map((item) => (
          <li key={item.displayName} className="flex items-center gap-2">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            <span>
              {shortCity(item.displayName)}
              <span className="tabular-nums text-muted-foreground/80">
                {' '}
                · {item.years} {item.years === 1 ? 'yr' : 'yrs'}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="text-center text-xs text-muted-foreground">
        Radial line · {birthYear}–{latestCompleteYear} clockwise from top · radius = annual rainfall
      </p>
    </section>
  )
}

function RadialPanel({
  geometry,
  birthYear,
  latestCompleteYear,
}: {
  geometry: RadialGeometry
  birthYear: number
  latestCompleteYear: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [activeYear, setActiveYear] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const active = geometry.points.find((p) => p.year === activeYear) ?? null

  function hitTest(clientX: number, clientY: number): YearPoint | null {
    const svg = svgRef.current
    if (!svg || geometry.points.length === 0) return null

    const rect = svg.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * SIZE
    const y = ((clientY - rect.top) / rect.height) * SIZE
    const angle = Math.atan2(y - CENTER, x - CENTER)

    let best: YearPoint | null = null
    let bestDelta = Infinity

    for (const point of geometry.points) {
      const delta = angularDistance(angle, point.angle)
      if (delta < bestDelta) {
        bestDelta = delta
        best = point
      }
    }

    const wedge = Math.PI / Math.max(geometry.points.length, 10)
    return bestDelta <= wedge ? best : null
  }

  function handlePointerMove(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current
    if (!svg) return

    const hit = hitTest(event.clientX, event.clientY)
    setActiveYear(hit?.year ?? null)

    const rect = svg.getBoundingClientRect()
    setTooltipPos({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  return (
    <div className="flex justify-center">
      <div className="relative w-full max-w-md">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full cursor-crosshair touch-none"
          role="img"
          aria-label={`Radial line chart of annual rainfall from ${birthYear} to ${latestCompleteYear}.`}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setActiveYear(null)}
        >
          {geometry.gridCircles.map((ring) => (
            <g key={ring.label}>
              <circle
                cx={CENTER}
                cy={CENTER}
                r={ring.r}
                fill="none"
                stroke="currentColor"
                strokeOpacity={ring.label === geometry.valueMax ? 0.16 : 0.07}
                strokeWidth={1}
              />
            </g>
          ))}

          {geometry.yearTicks.map((tick) => (
            <g key={tick.year}>
              <line
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeWidth={1}
              />
              <text
                x={tick.lx}
                y={tick.ly}
                textAnchor={tick.anchor}
                dominantBaseline="middle"
                fontSize={9}
                className="fill-muted-foreground tabular-nums"
                pointerEvents="none"
              >
                {tick.year}
              </text>
            </g>
          ))}

          <path
            d={geometry.linePath}
            fill="none"
            stroke={COLOR_LINE}
            strokeWidth={1.5}
            strokeOpacity={0.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {geometry.lineSegments.map((segment) => (
            <path
              key={segment.key}
              d={segment.d}
              fill="none"
              stroke={segment.color}
              strokeWidth={activeYear == null ? 2.25 : 1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={activeYear == null ? 1 : 0.45}
            />
          ))}

          {geometry.points.map((point) => (
            <circle
              key={point.year}
              cx={point.x}
              cy={point.y}
              r={activeYear === point.year ? 4.5 : 2.5}
              fill={point.color}
              stroke="#2a2418"
              strokeWidth={0.35}
              opacity={activeYear == null || activeYear === point.year ? 1 : 0.35}
            />
          ))}

          <text
            x={CENTER}
            y={CENTER - 6}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fontWeight={600}
            className="fill-foreground"
            pointerEvents="none"
          >
            {geometry.points.length} yrs
          </text>
          <text
            x={CENTER}
            y={CENTER + 10}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={8}
            className="fill-muted-foreground tabular-nums"
            pointerEvents="none"
          >
            {geometry.valueMin}–{geometry.valueMax} mm
          </text>
        </svg>

        {active ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: tooltipPos.x, top: tooltipPos.y - 8 }}
          >
            <p className="font-medium tabular-nums">
              {active.year} · {shortCity(active.displayName)}
            </p>
            <p className="text-muted-foreground tabular-nums">
              {active.precipMm.toLocaleString()} mm rain
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function buildHeadline(geometry: RadialGeometry): { main: string; sub: string } {
  const points = geometry.points
  const wettest = [...points].sort((a, b) => b.precipMm - a.precipMm)[0]
  const driest = [...points].sort((a, b) => a.precipMm - b.precipMm)[0]
  const cityCount = geometry.legend.length

  if (cityCount === 1 && wettest) {
    return {
      main: `${shortCity(wettest.displayName)}, year by year.`,
      sub: `A line chart wrapped round — each point is one year, distance from centre is how much it rained.`,
    }
  }

  if (wettest && driest && cityCount > 1) {
    return {
      main: 'One line, every home you have known.',
      sub: `Years stitched clockwise from birth. Wettest: ${wettest.year} in ${shortCity(wettest.displayName)} (${wettest.precipMm.toLocaleString()} mm). Driest: ${driest.year} (${driest.precipMm.toLocaleString()} mm).`,
    }
  }

  return {
    main: 'Your life in rainfall.',
    sub: 'Radial line graph — categories are years, straight segments connect each one round the circle.',
  }
}

function buildRadialGeometry(
  birthYear: number,
  livedCities: LivedCity[],
  rainRings: RainRingsInsight | null | undefined,
  latestCompleteYear: number,
): RadialGeometry {
  const empty: RadialGeometry = {
    points: [],
    linePath: '',
    lineSegments: [],
    gridCircles: [],
    yearTicks: [],
    legend: [],
    valueMin: 0,
    valueMax: 0,
  }

  if (livedCities.length === 0 || !rainRings) {
    return empty
  }

  const precipByCity = new Map(
    rainRings.byCity.map((city) => [
      city.displayName,
      new Map(city.years.map((year) => [year.year, year.precipMm])),
    ]),
  )

  const colorByCity = new Map<string, string>()
  const legendYears = new Map<string, { displayName: string; color: string; years: number }>()
  const rawPoints: Omit<YearPoint, 'angle' | 'radius' | 'x' | 'y'>[] = []

  for (const stint of livedCities) {
    const startYear = Number(stint.start.slice(0, 4))
    const endYear = stint.end ? Number(stint.end.slice(0, 4)) : latestCompleteYear
    const precipMap = precipByCity.get(stint.displayName)

    let color = colorByCity.get(stint.displayName)
    if (!color) {
      color = CITY_PALETTE[colorByCity.size % CITY_PALETTE.length]!
      colorByCity.set(stint.displayName, color)
    }

    for (let year = startYear; year <= endYear; year += 1) {
      if (year < birthYear || year > latestCompleteYear) continue
      const precipMm = precipMap?.get(year)
      if (precipMm == null) continue

      rawPoints.push({ year, precipMm, displayName: stint.displayName, color })

      const legend = legendYears.get(stint.displayName)
      if (legend) {
        legend.years += 1
      } else {
        legendYears.set(stint.displayName, { displayName: stint.displayName, color, years: 1 })
      }
    }
  }

  if (rawPoints.length < 2) {
    return empty
  }

  const values = rawPoints.map((p) => p.precipMm)
  const valueMin = Math.min(...values)
  const valueMax = Math.max(...values)

  const radiusScale = (value: number) => {
    if (valueMax <= valueMin) {
      return (MIN_R + MAX_R) / 2
    }
    const t = (value - valueMin) / (valueMax - valueMin)
    return MIN_R + t * (MAX_R - MIN_R)
  }

  const points: YearPoint[] = rawPoints.map((point) => {
    const angle = yearToAngle(point.year, birthYear, latestCompleteYear)
    const radius = radiusScale(point.precipMm)
    const { x, y } = polarToXY(radius, angle)
    return { ...point, angle, radius, x, y }
  })

  const gridCircles = GRID_LEVELS.map((level) => {
    const value = valueMin + level * (valueMax - valueMin)
    return { r: radiusScale(value), label: Math.round(value) }
  })

  return {
    points,
    linePath: buildLinePath(points),
    lineSegments: buildColoredSegments(points),
    gridCircles,
    yearTicks: buildYearTicks(birthYear, latestCompleteYear),
    legend: [...legendYears.values()].sort((a, b) => b.years - a.years),
    valueMin: Math.round(valueMin),
    valueMax: Math.round(valueMax),
  }
}

function buildLinePath(points: YearPoint[]): string {
  if (points.length === 0) return ''
  const first = points[0]!
  let d = `M ${first.x} ${first.y} `
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i]!
    d += `L ${point.x} ${point.y} `
  }
  return d
}

function buildColoredSegments(points: YearPoint[]): LineSegment[] {
  if (points.length < 2) return []

  const segments: LineSegment[] = []
  let color = points[0]!.color
  let start = points[0]!
  let path = `M ${start.x} ${start.y} `

  for (let i = 1; i < points.length; i += 1) {
    const point = points[i]!
    if (point.color !== color) {
      segments.push({ key: `${start.year}-${points[i - 1]!.year}`, color, d: path })
      color = point.color
      start = points[i - 1]!
      path = `M ${start.x} ${start.y} `
    }
    path += `L ${point.x} ${point.y} `
  }

  segments.push({
    key: `${start.year}-${points[points.length - 1]!.year}`,
    color,
    d: path,
  })

  return segments
}

function buildYearTicks(
  birthYear: number,
  latestCompleteYear: number,
): RadialGeometry['yearTicks'] {
  const span = latestCompleteYear - birthYear
  const count = span <= 12 ? span + 1 : span <= 30 ? 5 : 6
  const years: number[] = []

  for (let i = 0; i < count; i += 1) {
    years.push(
      i === count - 1 ? latestCompleteYear : Math.round(birthYear + (span * i) / (count - 1)),
    )
  }

  const uniqueYears = [...new Set(years)].sort((a, b) => a - b)

  return uniqueYears.map((year, index) => {
    const angle = yearToAngle(year, birthYear, latestCompleteYear)
    const inner = polarToXY(MIN_R - 6, angle)
    const outer = polarToXY(TICK_R, angle)
    const label = polarToXY(LABEL_R, angle)
    const anchor: 'start' | 'middle' | 'end' =
      index === 0 ? 'start' : index === uniqueYears.length - 1 ? 'end' : 'middle'

    return {
      year,
      x1: inner.x,
      y1: inner.y,
      x2: outer.x,
      y2: outer.y,
      lx: label.x,
      ly: label.y,
      anchor,
    }
  })
}

function yearToAngle(year: number, birthYear: number, latestCompleteYear: number): number {
  const span = latestCompleteYear - birthYear
  if (span <= 0) {
    return -Math.PI / 2
  }
  const t = (year - birthYear) / span
  return -Math.PI / 2 + t * Math.PI * 2
}

function polarToXY(radius: number, angle: number): { x: number; y: number } {
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  }
}

function angularDistance(a: number, b: number): number {
  let delta = Math.abs(a - b)
  if (delta > Math.PI) {
    delta = Math.PI * 2 - delta
  }
  return delta
}

function shortCity(displayName: string): string {
  return displayName.split(',')[0]?.trim() ?? displayName
}
