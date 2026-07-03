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
        <p className="text-sm text-muted-foreground">The trail your years left</p>
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
        <defs>
          <linearGradient id="sky-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fce4c8" stopOpacity={0.4} />
            <stop offset="45%" stopColor="#eaf3fb" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#d3e3f4" stopOpacity={0.12} />
          </linearGradient>
        </defs>

        <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          {/* Sky background box */}
          <rect
            x={0}
            y={0}
            width={INNER_WIDTH}
            height={INNER_HEIGHT}
            fill="url(#sky-gradient)"
            rx={8}
          />

          <YAxis ticks={geometry.yTicks} />

          {/* Balloon anchor ropes (tethers) */}
          {geometry.points.map((point) => (
            <line
              key={`stem-${point.year}`}
              x1={point.x}
              x2={point.x}
              y1={point.y}
              y2={geometry.yBaseline}
              stroke={point.color}
              strokeOpacity={hovered?.year === point.year ? 0.65 : 0}
              strokeWidth={hovered?.year === point.year ? 1.75 : 1}
              strokeDasharray="3 3"
              strokeLinecap="round"
              style={{
                transition: 'stroke-opacity 0.2s ease, stroke-width 0.2s ease',
              }}
            />
          ))}

          {/* Hot Air Balloons */}
          {geometry.points.map((point) => {
            const minScale = 1.35
            const maxScale = 1.75
            const range = geometry.yMax - geometry.yMin
            const ratio = range > 0 ? (point.meanTempC - geometry.yMin) / range : 0.5
            const scale = minScale + ratio * (maxScale - minScale)

            return (
              <HotAirBalloon
                key={point.year}
                x={point.x}
                y={point.y}
                color={point.color}
                isHovered={hovered?.year === point.year}
                scale={scale}
              />
            )
          })}

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
          className="pointer-events-none absolute z-10 flex flex-col gap-0.5 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translate(-50%, calc(-100% - 20px))',
          }}
        >
          <p className="font-semibold text-foreground leading-none mb-1">
            {hovered.year} · {hovered.meanTempC.toFixed(1)}°C average
          </p>
          {hovered.peakTempC && (
            <p className="text-muted-foreground text-[11px] leading-tight">
              Hottest: <span className="text-foreground font-medium">{hovered.peakTempC.toFixed(1)}°C</span>
              {hovered.peakDate && ` (on ${formatDate(hovered.peakDate)})`}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">{shortCity(hovered.displayName)}</p>
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
  const firstPoint = insight.years[0]!
  const lastPoint = insight.years[insight.years.length - 1]!
  const startYear = firstPoint.year
  const endYear = lastPoint.year
  const span = insight.years.length
  const cityCount = insight.cities.length

  // lifeDeltaC compares the first tracked year to the last. When those two
  // years are in different cities, the difference mostly reflects the move
  // (e.g. Kanpur → higher, cooler Bengaluru), not the climate warming or
  // cooling. Reword those cases so we don't imply a climate trend.
  const firstCity = shortCity(firstPoint.displayName)
  const lastCity = shortCity(lastPoint.displayName)
  const movedEndpoints = firstPoint.cityName !== lastPoint.cityName

  if (insight.lifeDeltaC != null && insight.lifeDeltaC >= 0.3) {
    if (movedEndpoints) {
      return {
        main: 'Warmth followed you house to house.',
        sub: `${span} years across ${cityCount} cities. Your latest year (${endYear}, ${lastCity}) averaged ${insight.lifeDeltaC.toFixed(1)}°C above your first (${startYear}, ${firstCity}) — a mix of a warming climate and moving between cities.`,
      }
    }
    return {
      main: 'The heat rose steadily in your chart.',
      sub: `Across ${span} years in ${cityCount === 1 ? shortCity(insight.cities[0]!.displayName) : `${cityCount} cities`}, annual mean temperature rose ${insight.lifeDeltaC.toFixed(1)}°C from ${startYear} to ${endYear}${insight.warmestYear != null ? ` — your warmest year so far was ${insight.warmestYear}` : ''}.`,
    }
  }

  if (insight.lifeDeltaC != null && insight.lifeDeltaC <= -0.3) {
    if (movedEndpoints) {
      return {
        main: 'You moved into a cooler house.',
        sub: `${span} years across ${cityCount} cities. Your latest year (${endYear}, ${lastCity}) averaged ${Math.abs(insight.lifeDeltaC).toFixed(1)}°C below your first (${startYear}, ${firstCity}) — largely because you moved, not because the climate cooled. Each city you lived in kept warming.`,
      }
    }
    return {
      main: 'A cool current ran through your years.',
      sub: `${span} years tracked from ${startYear} to ${endYear}. Mean temperature fell ${Math.abs(insight.lifeDeltaC).toFixed(1)}°C over that span${insight.coolestYear != null ? ` — coolest was ${insight.coolestYear}` : ''}.`,
    }
  }

  return {
    main: 'Every year you lived, read in degrees.',
    sub: `${span} years from ${startYear} to ${endYear}${cityCount > 1 ? ` across ${cityCount} cities` : ''}. Each dot is the mean temperature for that calendar year.`,
  }
}

function shortCity(displayName: string): string {
  return displayName.split(',')[0]?.trim() ?? displayName
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function HotAirBalloon({
  x,
  y,
  color,
  isHovered,
  scale = 1
}: {
  x: number
  y: number
  color: string
  isHovered: boolean
  scale?: number
}) {
  const hoverScale = isHovered ? scale * 1.08 : scale

  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{
        transform: `translate(${x}px, ${isHovered ? y - 10 : y}px) scale(${hoverScale})`,
        transformOrigin: '0px 0px',
        transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      }}
      className="cursor-pointer"
    >
      {/* Balloon Envelope */}
      <path
        d="M -9,-12 a 9,9 0 1,1 18,0 c 0,4.5 -3.5,9 -4.5,12 h -9 c -1,-3 -4.5,-7.5 -4.5,-12 z"
        fill={color}
        stroke="var(--background)"
        strokeWidth={1.5}
      />
      {/* Decorative Stripes */}
      <path
        d="M -4.5,-21 c 2.5,3.5 2.5,13.5 0,21"
        fill="none"
        stroke="white"
        strokeWidth={1}
        strokeOpacity={0.4}
      />
      <path
        d="M 4.5,-21 c -2.5,3.5 -2.5,13.5 0,21"
        fill="none"
        stroke="white"
        strokeWidth={1}
        strokeOpacity={0.4}
      />
      <line
        x1={0}
        y1={-21}
        x2={0}
        y2={0}
        fill="none"
        stroke="white"
        strokeWidth={1.25}
        strokeOpacity={0.25}
      />
      {/* Basket Ropes */}
      <line
        x1={-3}
        y1={0}
        x2={-2}
        y2={4}
        stroke="currentColor"
        strokeWidth={0.75}
        strokeOpacity={0.5}
      />
      <line
        x1={3}
        y1={0}
        x2={2}
        y2={4}
        stroke="currentColor"
        strokeWidth={0.75}
        strokeOpacity={0.5}
      />
      {/* Wicker Basket */}
      <rect
        x={-2.5}
        y={4}
        width={5}
        height={4}
        rx={0.75}
        fill="#c4976c"
        stroke="#6e4f30"
        strokeWidth={0.75}
      />
    </g>
  )
}
