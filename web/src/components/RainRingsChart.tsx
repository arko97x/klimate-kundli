import { useMemo, useRef, useState } from 'react'

import type { RainRingsCity, RainRingsInsight } from '@/lib/api'
import { parallelAnnulusPath, permutationForSeed } from '@/lib/organicTreeRing'

const SIZE = 400
const CENTER = SIZE / 2
const MIN_RADIUS = 28
const MAX_RADIUS = 172
const WIDTH_EXPONENT = 1.15

type RainRingsChartProps = {
  insight: RainRingsInsight
  source: string
}

export function RainRingsChart({ insight, source }: RainRingsChartProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const cities = insight.byCity
  const active = cities[activeIndex] ?? cities[0]

  const colorScale = useMemo(() => buildSharedColorScale(cities), [cities])

  const wigglePerm = useMemo(
    () => permutationForSeed(hashLabel(active.displayName)),
    [active?.displayName],
  )

  const rings = useMemo(
    () =>
      active
        ? buildRingGeometry(
            active.years.map((y) => ({ year: y.year, precipMm: y.precipMm })),
            colorScale.min,
            colorScale.max,
            wigglePerm,
          )
        : [],
    [active, colorScale.max, colorScale.min, wigglePerm],
  )

  if (!active) return null

  const headline = buildHeadline(active, insight.birthYear)

  return (
    <section className="space-y-6 pb-6">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Rainfall memory</p>
        <h3 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {headline.main}
        </h3>
        <p className="max-w-3xl text-pretty text-muted-foreground">{headline.sub}</p>
      </div>

      {cities.length > 1 ? (
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Cities for rainfall rings"
        >
          {cities.map((city, index) => (
            <button
              key={city.displayName}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              className={
                index === activeIndex
                  ? 'rounded-full border border-border bg-foreground px-3 py-1.5 text-sm font-medium text-background'
                  : 'rounded-full border border-border bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50'
              }
              onClick={() => setActiveIndex(index)}
            >
              {shortCity(city.displayName)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex justify-center">
        <RingPanel city={active} rings={rings} colorScale={colorScale} />
      </div>

      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-6 rounded-sm bg-[#c4a574]" aria-hidden />
          Drier years
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-6 rounded-sm bg-[#2a6f97]" aria-hidden />
          Wetter years
        </span>
        <span>Each band = one year · thicker = more rain · rings share one shape (no crossing)</span>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Organic rings (noise-shaped, like a tree cross-section) · {active.startYear}–{active.endYear} ·{' '}
        {source.replace('_', ' ')}
      </p>
    </section>
  )
}

function buildHeadline(city: RainRingsCity, birthYear: number): { main: string; sub: string } {
  const label = shortCity(city.displayName)
  const span = city.years.length
  const wettest = city.wettestYear
  const pctWet = Math.round((city.wetYearsAboveMedian / span) * 100)

  if (wettest != null && city.driestYear != null && city.years.length >= 4) {
    const wettestMm = city.years.find((y) => y.year === wettest)?.precipMm
    return {
      main: `Wet and dry years in ${label}.`,
      sub: `You lived through ${span} rainy seasons there since ${birthYear}. ${pctWet}% of those years were wetter than your own median — your soggiest was ${wettest}${wettestMm != null ? ` (${wettestMm.toLocaleString()} mm)` : ''}, your driest ${city.driestYear}.`,
    }
  }

  return {
    main: `Year by year, rain in ${label}.`,
    sub: `${span} rings — each band is total rainfall for a year you spent in that place.`,
  }
}

function RingPanel({
  city,
  rings,
  colorScale,
}: {
  city: RainRingsCity
  rings: RingGeometry[]
  colorScale: ColorScale
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredRing, setHoveredRing] = useState<RingGeometry | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const first = city.years[0]

  function handlePointerMove(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * SIZE
    const y = ((event.clientY - rect.top) / rect.height) * SIZE
    const radius = Math.hypot(x - CENTER, y - CENTER)
    const ring = findRingAtRadius(rings, radius)

    setHoveredRing(ring)
    setTooltipPos({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-sm font-medium">{shortCity(city.displayName)}</p>
        <p className="text-xs text-muted-foreground">
          {city.startYear}–{city.endYear}
        </p>
      </div>
      <div className="relative mx-auto w-full max-w-md">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full cursor-crosshair touch-none"
          role="img"
          aria-label={`Rainfall tree rings for ${shortCity(city.displayName)} from ${city.startYear} to ${city.endYear}.`}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoveredRing(null)}
        >
          {rings.map((ring) => (
            <path
              key={ring.year}
              d={ring.d}
              fill={ring.color}
              stroke="#2a2418"
              strokeWidth={0.35}
              strokeLinejoin="round"
              opacity={hoveredRing == null || hoveredRing.year === ring.year ? 1 : 0.45}
            />
          ))}

          <text
            x={CENTER}
            y={CENTER - 3}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#3d3020"
            fontSize={10}
            fontWeight={600}
            pointerEvents="none"
          >
            {first?.year ?? city.startYear}
          </text>
          <text
            x={CENTER}
            y={CENTER + 11}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#3d302099"
            fontSize={8}
            className="tabular-nums"
            pointerEvents="none"
          >
            {first ? `${first.precipMm} mm` : ''}
          </text>
        </svg>

        {hoveredRing ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: tooltipPos.x, top: tooltipPos.y - 8 }}
          >
            <p className="font-medium tabular-nums">{hoveredRing.year}</p>
            <p className="text-muted-foreground tabular-nums">
              {hoveredRing.precipMm.toLocaleString()} mm rain
            </p>
          </div>
        ) : null}
      </div>
      <p className="text-center text-xs text-muted-foreground tabular-nums">
        {formatMm(colorScale.min)}–{formatMm(colorScale.max)} mm scale across your cities
      </p>
    </div>
  )
}

type YearPoint = { year: number; precipMm: number }

type RingGeometry = {
  year: number
  precipMm: number
  innerR: number
  outerR: number
  d: string
  color: string
}

type ColorScale = { min: number; max: number }

function buildSharedColorScale(cities: RainRingsCity[]): ColorScale {
  const values = cities.flatMap((c) => c.years.map((y) => y.precipMm))
  if (values.length === 0) return { min: 0, max: 1 }
  return { min: Math.min(...values), max: Math.max(...values) }
}

function buildRingGeometry(
  years: YearPoint[],
  colorMin: number,
  colorMax: number,
  wigglePerm: number[],
): RingGeometry[] {
  if (years.length === 0) return []

  const colorSpan = colorMax - colorMin
  const availableSpan = MAX_RADIUS - MIN_RADIUS
  const weights = years.map((p) => Math.pow(p.precipMm, WIDTH_EXPONENT))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  let radius = MIN_RADIUS
  const rings: RingGeometry[] = []

  for (let index = 0; index < years.length; index += 1) {
    const point = years[index]!
    const width =
      totalWeight > 0
        ? Math.max(1.25, (weights[index]! / totalWeight) * availableSpan)
        : availableSpan / years.length
    const inner = radius
    const outer = inner + width
    const norm = colorSpan > 0 ? (point.precipMm - colorMin) / colorSpan : 0.5

    rings.push({
      year: point.year,
      precipMm: point.precipMm,
      innerR: inner,
      outerR: outer,
      d: parallelAnnulusPath(CENTER, CENTER, inner, outer, wigglePerm),
      color: ringWoodColor(norm),
    })
    radius = outer
  }

  return rings
}

function hashLabel(label: string): number {
  let hash = 0
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  }
  return hash
}

/** Warm wood tones — dry heartwood to wet growth. */
function ringWoodColor(norm: number): string {
  if (norm < 0.35) return mixHex('#c9b896', '#a8c4b0', norm / 0.35)
  if (norm < 0.7) return mixHex('#a8c4b0', '#6a9eb5', (norm - 0.35) / 0.35)
  return mixHex('#6a9eb5', '#3d6f8c', (norm - 0.7) / 0.3)
}

function findRingAtRadius(rings: RingGeometry[], radius: number): RingGeometry | null {
  if (radius < MIN_RADIUS - 8 || radius > MAX_RADIUS + 12) return null
  for (let index = rings.length - 1; index >= 0; index -= 1) {
    const ring = rings[index]!
    if (radius >= ring.innerR - 2 && radius <= ring.outerR + 4) return ring
  }
  return null
}

function shortCity(displayName: string): string {
  return displayName.split(',')[0]?.trim() ?? displayName
}

function formatMm(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function mixHex(a: string, b: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t))
  const ar = parseInt(a.slice(1, 3), 16)
  const ag = parseInt(a.slice(3, 5), 16)
  const ab = parseInt(a.slice(5, 7), 16)
  const br = parseInt(b.slice(1, 3), 16)
  const bg = parseInt(b.slice(3, 5), 16)
  const bb = parseInt(b.slice(5, 7), 16)
  const r = Math.round(ar + (br - ar) * clamp)
  const g = Math.round(ag + (bg - ag) * clamp)
  const bl = Math.round(ab + (bb - ab) * clamp)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}
