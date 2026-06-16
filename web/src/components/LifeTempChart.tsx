import { useMemo, useRef, useState, type PointerEvent } from 'react'

import type { TempTimelineInsight, TempTimelineYear } from '@/lib/api'
import { formatDataSource } from '@/lib/utils'

const CITY_PALETTE = ['#6b8eb8', '#d3674a', '#5c8a6e', '#9a6b4a', '#7a5c8a', '#4a7a8a', '#b87a4a']

const VIEWBOX_WIDTH = 840
const VIEWBOX_HEIGHT = 360
const MARGIN = { top: 28, right: 24, bottom: 52, left: 52 }
const INNER_WIDTH = VIEWBOX_WIDTH - MARGIN.left - MARGIN.right
const INNER_HEIGHT = VIEWBOX_HEIGHT - MARGIN.top - MARGIN.bottom

type LifeTempChartProps = {
  insight: TempTimelineInsight
  source: string
  confidence: string
}

type ChartPoint = TempTimelineYear & {
  x: number
  y: number
  color: string
}

type Geometry = {
  points: ChartPoint[]
  yBaseline: number
  yTicks: { value: number; y: number }[]
  xTicks: { year: number; x: number }[]
  cityColors: Map<string, string>
  yMin: number
  yMax: number
}

export function LifeTempChart({ insight, source, confidence }: LifeTempChartProps) {
  const geometry = useMemo(() => buildGeometry(insight), [insight])
  const headline = buildHeadline(insight)

  if (geometry.points.length < 2) {
    return null
  }

  return (
    <section className="space-y-6 pb-2">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Your climate trail</p>
        <h3 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {headline.main}
        </h3>
        <p className="max-w-3xl text-pretty text-muted-foreground">{headline.sub}</p>
      </div>

      <ChartPanel geometry={geometry} birthYear={insight.birthYear} />

      <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {insight.cities.map((city) => (
            <LegendSwatch
              key={city.cityName}
              color={geometry.cityColors.get(city.cityName) ?? CITY_PALETTE[0]!}
              label={shortCity(city.displayName)}
            />
          ))}
          <span className="text-xs text-muted-foreground">
            Dot = mean temp that year · stem = one year
          </span>
          <span className="text-xs uppercase tracking-wider opacity-70">
            {formatDataSource(source)} · {confidence}
          </span>
        </dl>
      </footer>
    </section>
  )
}

function ChartPanel({ geometry, birthYear }: { geometry: Geometry; birthYear: number }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hovered, setHovered] = useState<ChartPoint | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const birthX = geometry.points.find((p) => p.year === birthYear)?.x

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    const svgX = ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH
    const localX = svgX - MARGIN.left

    let nearest: ChartPoint | null = null
    let nearestDist = Infinity
    for (const point of geometry.points) {
      const dist = Math.abs(point.x - localX)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = point
      }
    }

    if (nearest && nearestDist <= INNER_WIDTH / geometry.points.length) {
      setHovered(nearest)
      setTooltipPos({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    } else {
      setHovered(null)
    }
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="block h-auto w-full touch-none"
        role="img"
        aria-label={`Annual mean temperature by year from ${geometry.points[0]!.year} to ${geometry.points[geometry.points.length - 1]!.year}.`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHovered(null)}
      >
        <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          <YAxis ticks={geometry.yTicks} />

          {geometry.points.map((point) => (
            <line
              key={`stem-${point.year}`}
              x1={point.x}
              x2={point.x}
              y1={point.y}
              y2={geometry.yBaseline}
              stroke={point.color}
              strokeOpacity={hovered?.year === point.year ? 0.55 : 0.28}
              strokeWidth={hovered?.year === point.year ? 2 : 1.25}
              strokeLinecap="round"
            />
          ))}

          {geometry.points.map((point) => (
            <circle
              key={point.year}
              cx={point.x}
              cy={point.y}
              r={hovered?.year === point.year ? 5.5 : 4}
              fill={point.color}
              stroke="var(--background)"
              strokeWidth={1.5}
            />
          ))}

          {birthX != null ? (
            <g aria-hidden>
              <line
                x1={birthX}
                x2={birthX}
                y1={0}
                y2={INNER_HEIGHT}
                stroke="currentColor"
                strokeOpacity={0.12}
                strokeDasharray="4 4"
              />
              <text
                x={birthX}
                y={-8}
                textAnchor="middle"
                fontSize={10}
                className="fill-muted-foreground"
              >
                born
              </text>
            </g>
          ) : null}

          <XAxis ticks={geometry.xTicks} />
        </g>
      </svg>

      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translate(-50%, calc(-100% - 10px))',
          }}
        >
          <p className="font-medium text-foreground">
            {hovered.year} · {hovered.meanTempC.toFixed(1)}°C
          </p>
          <p className="text-muted-foreground">{shortCity(hovered.displayName)}</p>
        </div>
      ) : null}
    </div>
  )
}

function YAxis({ ticks }: { ticks: { value: number; y: number }[] }) {
  return (
    <g aria-hidden>
      {ticks.map((tick) => (
        <g key={tick.value} transform={`translate(0, ${tick.y})`}>
          <line x1={0} x2={INNER_WIDTH} stroke="currentColor" strokeOpacity={0.08} />
          <text x={-10} y={4} textAnchor="end" fontSize={11} className="fill-muted-foreground tabular-nums">
            {Number.isInteger(tick.value) ? tick.value : tick.value.toFixed(1)}°
          </text>
        </g>
      ))}
    </g>
  )
}

function XAxis({ ticks }: { ticks: { year: number; x: number }[] }) {
  return (
    <g transform={`translate(0, ${INNER_HEIGHT})`} aria-hidden>
      {ticks.map((tick) => (
        <text
          key={tick.year}
          x={tick.x}
          y={22}
          textAnchor="middle"
          fontSize={10}
          className="fill-muted-foreground tabular-nums"
        >
          {tick.year}
        </text>
      ))}
    </g>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="m-0">{label}</dd>
    </div>
  )
}

function buildGeometry(insight: TempTimelineInsight): Geometry {
  const pointsRaw = insight.years
  const temps = pointsRaw.map((p) => p.meanTempC)
  const dataMin = Math.min(...temps)
  const dataMax = Math.max(...temps)
  const { yMin, yMax } = computeYDomain(dataMin, dataMax)

  const yearMin = pointsRaw[0]!.year
  const yearMax = pointsRaw[pointsRaw.length - 1]!.year
  const yearSpan = Math.max(1, yearMax - yearMin)

  const yScale = (value: number) => INNER_HEIGHT - ((value - yMin) / (yMax - yMin)) * INNER_HEIGHT
  const xScale = (year: number) => ((year - yearMin) / yearSpan) * INNER_WIDTH
  const yBaseline = yScale(yMin)

  const cityColors = new Map<string, string>()
  insight.cities.forEach((city, index) => {
    cityColors.set(city.cityName, CITY_PALETTE[index % CITY_PALETTE.length]!)
  })

  const points: ChartPoint[] = pointsRaw.map((point) => ({
    ...point,
    x: xScale(point.year),
    y: yScale(point.meanTempC),
    color: cityColors.get(point.cityName) ?? CITY_PALETTE[0]!,
  }))

  const yTicks = computeYTicks(yMin, yMax).map((value) => ({ value, y: yScale(value) }))
  const xTicks = computeXTicks(yearMin, yearMax).map((year) => ({ year, x: xScale(year) }))

  return { points, yBaseline, yTicks, xTicks, cityColors, yMin, yMax }
}

function computeYDomain(dataMin: number, dataMax: number): { yMin: number; yMax: number } {
  const span = Math.max(dataMax - dataMin, 0.4)
  const pad = Math.max(0.2, span * 0.06)
  const step = span <= 2 ? 0.5 : span <= 5 ? 1 : niceStep(span / 4)

  const yMin = Math.floor((dataMin - pad) / step) * step
  const yMax = Math.ceil((dataMax + pad) / step) * step

  return { yMin, yMax }
}

function computeYTicks(yMin: number, yMax: number): number[] {
  const range = yMax - yMin
  if (range <= 0) return [yMin]
  const step = range <= 2 ? 0.5 : range <= 5 ? 1 : niceStep(range / 5)
  const ticks: number[] = []
  const start = Math.ceil(yMin / step) * step
  for (let v = start; v <= yMax + step * 0.001; v += step) {
    ticks.push(Math.round(v * 10) / 10)
  }
  return ticks
}

function computeXTicks(yearMin: number, yearMax: number): number[] {
  const span = yearMax - yearMin
  const step = span <= 12 ? 2 : span <= 24 ? 4 : span <= 40 ? 5 : 10
  const ticks: number[] = [yearMin]
  let year = Math.ceil(yearMin / step) * step
  while (year < yearMax) {
    ticks.push(year)
    year += step
  }
  if (ticks[ticks.length - 1] !== yearMax) {
    ticks.push(yearMax)
  }
  return ticks
}

function niceStep(rough: number): number {
  if (rough <= 1) return 1
  if (rough <= 2) return 2
  if (rough <= 2.5) return 2
  if (rough <= 5) return 5
  return 10
}

function buildHeadline(insight: TempTimelineInsight): { main: string; sub: string } {
  const startYear = insight.years[0]!.year
  const endYear = insight.years[insight.years.length - 1]!.year
  const span = insight.years.length
  const cityCount = insight.cities.length

  if (insight.lifeDeltaC != null && insight.lifeDeltaC >= 0.3) {
    return {
      main: 'The air got warmer year by year.',
      sub: `Across ${span} years in ${cityCount === 1 ? shortCity(insight.cities[0]!.displayName) : `${cityCount} cities`}, annual mean temperature rose ${insight.lifeDeltaC.toFixed(1)}°C from ${startYear} to ${endYear}${insight.warmestYear != null ? ` — your warmest year so far was ${insight.warmestYear}` : ''}.`,
    }
  }

  if (insight.lifeDeltaC != null && insight.lifeDeltaC <= -0.3) {
    return {
      main: 'Your years ran slightly cooler on average.',
      sub: `${span} years tracked from ${startYear} to ${endYear}. Mean temperature fell ${Math.abs(insight.lifeDeltaC).toFixed(1)}°C over that span${insight.coolestYear != null ? ` — coolest was ${insight.coolestYear}` : ''}.`,
    }
  }

  return {
    main: 'Temperature, year by year, where you lived.',
    sub: `${span} years from ${startYear} to ${endYear}${cityCount > 1 ? ` across ${cityCount} cities` : ''}. Each dot is the mean temperature for that calendar year.`,
  }
}

function shortCity(displayName: string): string {
  return displayName.split(',')[0]?.trim() ?? displayName
}
