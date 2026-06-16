import { useMemo, useRef, useState } from 'react'

import type { IndiaEmissionsRings } from '@/lib/api'

const SIZE = 360
const CENTER = SIZE / 2
const MIN_RADIUS = 32
const MAX_RADIUS = 168
/** Slightly >1 exaggerates recent high-emission years while staying data-driven */
const WIDTH_EXPONENT = 1.2

type EmissionsRingsChartProps = {
  birthYear: number
  data: IndiaEmissionsRings
  parentsData?: IndiaEmissionsRings | null
}

export function EmissionsRingsChart({ birthYear, data, parentsData }: EmissionsRingsChartProps) {
  const parentsBirthYear = birthYear - 25
  const hasComparison = parentsData != null && parentsData.years.length > 0

  const colorScale = useMemo(
    () => buildSharedColorScale([data, ...(hasComparison ? [parentsData] : [])]),
    [data, hasComparison, parentsData],
  )

  const attendeeRings = useMemo(
    () => buildRingGeometry(data.years, colorScale.min, colorScale.max),
    [colorScale.max, colorScale.min, data.years],
  )
  const parentsRings = useMemo(
    () =>
      hasComparison
        ? buildRingGeometry(parentsData.years, colorScale.min, colorScale.max)
        : [],
    [colorScale.max, colorScale.min, hasComparison, parentsData],
  )

  const attendeeGrowth =
    data.growthFactor != null
      ? `${data.growthFactor}× higher than the year you were born`
      : 'higher now than when you were born'
  const parentsGrowth =
    parentsData?.growthFactor != null
      ? `${parentsData.growthFactor}× higher than when they were born`
      : 'higher now than when they were born'

  return (
    <section className="space-y-6 pb-6">
      <div className="space-y-3">
        <p className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          India&apos;s carbon emissions across your lifetime
        </p>
        <p className="text-sm text-muted-foreground">
          {hasComparison ? 'Your rings vs your parents\' rings.' : 'Every ring is a year you were alive.'}
        </p>
        <p className="max-w-3xl text-pretty text-muted-foreground">
          {hasComparison ? (
            <>
              Same national CO₂ story, two starting years — you from {data.startYear}, your parents&apos; generation
              from {parentsData.startYear}. Both run to {data.endYear}. India&apos;s emissions are {attendeeGrowth}{' '}
              for you and {parentsGrowth} for them.
            </>
          ) : (
            <>
              National CO₂ from {data.startYear} to {data.endYear} — {formatMt(data.firstCo2Mt)} Mt in{' '}
              {data.startYear}, {formatMt(data.lastCo2Mt)} Mt in {data.endYear}. India&apos;s emissions are{' '}
              {attendeeGrowth}.
            </>
          )}
        </p>
      </div>

      <div
        className={
          hasComparison
            ? 'mx-auto grid max-w-4xl gap-8 sm:grid-cols-2 sm:gap-6'
            : 'flex justify-center'
        }
      >
        <RingChartPanel
          label="You"
          subtitle={`Born ${birthYear}`}
          birthYear={birthYear}
          data={data}
          rings={attendeeRings}
        />
        {hasComparison ? (
          <RingChartPanel
            label="Your parents' generation"
            subtitle={`Born ~${parentsBirthYear}`}
            birthYear={parentsBirthYear}
            data={parentsData}
            rings={parentsRings}
          />
        ) : null}
      </div>

      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span>Lower emissions</span>
          <span
            className="inline-block h-2 w-20 rounded-sm bg-linear-to-r from-[#f5d547] via-[#d45a3a] to-[#8e3a7a]"
            aria-hidden
          />
          <span>Higher emissions</span>
        </span>
        <span>
          Ring thickness = that year&apos;s share of lifetime emissions
          {hasComparison ? ' · color = same scale on both charts' : ' · color = same scale'}
        </span>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Inner ring = birth year · outer ring = {data.endYear} ({formatMt(data.lastCo2Mt)} Mt) · color scale{' '}
        {formatMt(colorScale.min)}–{formatMt(colorScale.max)} Mt (OWID)
      </p>
    </section>
  )
}

type RingChartPanelProps = {
  label: string
  subtitle: string
  birthYear: number
  data: IndiaEmissionsRings
  rings: RingGeometry[]
}

function RingChartPanel({ label, subtitle, birthYear, data, rings }: RingChartPanelProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredRing, setHoveredRing] = useState<RingGeometry | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const hubColor = rings[0]?.color ?? '#f5d547'
  const hubStroke = mixHex(hubColor, '#1a1028', 0.3)

  function handlePointerMove(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current
    if (!svg) {
      return
    }

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

  function handlePointerLeave() {
    setHoveredRing(null)
  }

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="relative mx-auto w-full max-w-xs">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full cursor-crosshair touch-none"
          role="img"
          aria-label={`Tree rings of India's yearly CO2 emissions from ${data.startYear} to ${data.endYear} for ${label}. Thicker rings mean higher emissions.`}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <circle cx={CENTER} cy={CENTER} r={MAX_RADIUS + 4} fill="#f4efe6" />
          <circle cx={CENTER} cy={CENTER} r={MAX_RADIUS + 4} fill="none" stroke="#e8dfd0" strokeWidth={1} />

          {rings.map((ring) => (
            <path
              key={ring.year}
              d={ring.d}
              fill={ring.color}
              stroke="#1a102820"
              strokeWidth={0.35}
              opacity={hoveredRing == null || hoveredRing.year === ring.year ? 1 : 0.55}
            />
          ))}

          <circle cx={CENTER} cy={CENTER} r={MIN_RADIUS - 4} fill={hubColor} pointerEvents="none" />
          <circle cx={CENTER} cy={CENTER} r={MIN_RADIUS - 4} fill="none" stroke={hubStroke} strokeWidth={1} pointerEvents="none" />
          <text
            x={CENTER}
            y={CENTER - 5}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#1a1028"
            fontSize={10}
            fontWeight={600}
            pointerEvents="none"
          >
            {birthYear}
          </text>
          <text
            x={CENTER}
            y={CENTER + 9}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#1a102899"
            fontSize={8}
            className="tabular-nums"
            pointerEvents="none"
          >
            {formatMt(data.firstCo2Mt)} Mt
          </text>
        </svg>

        {hoveredRing ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: tooltipPos.x, top: tooltipPos.y - 8 }}
          >
            <p className="font-medium tabular-nums">{hoveredRing.year}</p>
            <p className="text-muted-foreground tabular-nums">{formatMt(hoveredRing.co2Mt)} Mt CO₂</p>
          </div>
        ) : null}
      </div>
      <p className="text-center text-xs text-muted-foreground tabular-nums">
        {data.startYear} ({formatMt(data.firstCo2Mt)} Mt) → {data.endYear} ({formatMt(data.lastCo2Mt)} Mt)
        {data.growthFactor != null ? (
          <span className="text-base font-semibold text-foreground"> · {data.growthFactor}×</span>
        ) : null}
      </p>
    </div>
  )
}

type YearPoint = { year: number; co2Mt: number }

type RingGeometry = {
  year: number
  co2Mt: number
  innerR: number
  outerR: number
  d: string
  color: string
}

type ColorScale = {
  min: number
  max: number
}

function buildSharedColorScale(datasets: IndiaEmissionsRings[]): ColorScale {
  const values = datasets.flatMap((dataset) => dataset.years.map((point) => point.co2Mt))
  if (values.length === 0) {
    return { min: 0, max: 1 }
  }
  return { min: Math.min(...values), max: Math.max(...values) }
}

function buildRingGeometry(years: YearPoint[], colorMin: number, colorMax: number): RingGeometry[] {
  if (years.length === 0) {
    return []
  }

  const colorSpan = colorMax - colorMin
  const availableSpan = MAX_RADIUS - MIN_RADIUS

  const weights = years.map((point) => Math.pow(point.co2Mt, WIDTH_EXPONENT))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

  let radius = MIN_RADIUS
  const rings: RingGeometry[] = []

  for (let index = 0; index < years.length; index += 1) {
    const point = years[index]!
    const width = totalWeight > 0 ? (weights[index]! / totalWeight) * availableSpan : availableSpan / years.length
    const inner = radius
    const outer = inner + width
    const norm = colorSpan > 0 ? (point.co2Mt - colorMin) / colorSpan : 0.5

    rings.push({
      year: point.year,
      co2Mt: point.co2Mt,
      innerR: inner,
      outerR: outer,
      d: describeAnnulus(CENTER, CENTER, inner, outer),
      color: emissionColor(norm),
    })

    radius = outer
  }

  return rings
}

function emissionColor(norm: number): string {
  if (norm < 0.35) {
    return mixHex('#f5d547', '#f0a040', norm / 0.35)
  }
  if (norm < 0.7) {
    return mixHex('#f0a040', '#d45a3a', (norm - 0.35) / 0.35)
  }
  return mixHex('#d45a3a', '#8e3a7a', (norm - 0.7) / 0.3)
}

function findRingAtRadius(rings: RingGeometry[], radius: number): RingGeometry | null {
  if (radius < MIN_RADIUS - 4 || radius > MAX_RADIUS + 4) {
    return null
  }

  for (let index = rings.length - 1; index >= 0; index -= 1) {
    const ring = rings[index]!
    if (radius >= ring.innerR && radius <= ring.outerR) {
      return ring
    }
  }

  return null
}

function formatMt(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
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

function describeAnnulus(cx: number, cy: number, innerR: number, outerR: number): string {
  if (outerR <= innerR + 0.01) {
    return ''
  }

  return [
    `M ${cx - outerR} ${cy}`,
    `A ${outerR} ${outerR} 0 1 1 ${cx + outerR} ${cy}`,
    `A ${outerR} ${outerR} 0 1 1 ${cx - outerR} ${cy}`,
    `M ${cx - innerR} ${cy}`,
    `A ${innerR} ${innerR} 0 1 0 ${cx + innerR} ${cy}`,
    `A ${innerR} ${innerR} 0 1 0 ${cx - innerR} ${cy}`,
    'Z',
  ].join(' ')
}
