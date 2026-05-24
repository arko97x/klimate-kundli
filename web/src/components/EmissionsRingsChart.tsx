import { useMemo } from 'react'

import type { IndiaEmissionsRings } from '@/lib/api'

const SIZE = 420
const CENTER = SIZE / 2
const MIN_RADIUS = 36
const MAX_RADIUS = 196
/** Slightly >1 exaggerates recent high-emission years while staying data-driven */
const WIDTH_EXPONENT = 1.2

type EmissionsRingsChartProps = {
  birthYear: number
  data: IndiaEmissionsRings
}

export function EmissionsRingsChart({ birthYear, data }: EmissionsRingsChartProps) {
  const rings = useMemo(() => buildRingGeometry(data.years), [data.years])
  const growthLabel =
    data.growthFactor != null
      ? `${data.growthFactor}× higher than the year you were born`
      : 'higher now than when you were born'

  return (
    <section className="space-y-6 pb-6">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">India&apos;s emissions across your lifetime</p>
        <p className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Every ring is a year you were alive.
        </p>
        <p className="max-w-2xl text-pretty text-muted-foreground">
          National CO₂ from {data.startYear} to {data.endYear} — {formatMt(data.firstCo2Mt)} Mt in{' '}
          {data.startYear}, {formatMt(data.lastCo2Mt)} Mt in {data.endYear}. India&apos;s emissions are{' '}
          {growthLabel}.
        </p>
      </div>

      <div className="flex justify-center">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full max-w-md"
          role="img"
          aria-label={`Tree rings of India's yearly CO2 emissions from ${data.startYear} to ${data.endYear}. Thicker rings mean higher emissions.`}
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
            />
          ))}

          <circle cx={CENTER} cy={CENTER} r={MIN_RADIUS - 4} fill="#f5d547" />
          <circle cx={CENTER} cy={CENTER} r={MIN_RADIUS - 4} fill="none" stroke="#c4832a44" strokeWidth={1} />
          <text
            x={CENTER}
            y={CENTER - 5}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#1a1028"
            fontSize={10}
            fontWeight={600}
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
          >
            {formatMt(data.firstCo2Mt)} Mt
          </text>
        </svg>
      </div>

      <div className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-6 rounded-sm bg-[#f5d547]" aria-hidden />
          Lower emissions
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-6 rounded-sm bg-[#d45a3a]" aria-hidden />
          Higher emissions
        </span>
        <span>Ring thickness = that year&apos;s share of lifetime emissions · color = same scale</span>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Inner ring = {data.startYear} ({formatMt(data.firstCo2Mt)} Mt) · outer ring = {data.endYear} (
        {formatMt(data.lastCo2Mt)} Mt) · {data.growthFactor ?? '—'}× = {formatMt(data.lastCo2Mt)} ÷{' '}
        {formatMt(data.firstCo2Mt)} (OWID, Mt)
      </p>
    </section>
  )
}

type YearPoint = { year: number; co2Mt: number }

type RingGeometry = {
  year: number
  d: string
  color: string
}

function buildRingGeometry(years: YearPoint[]): RingGeometry[] {
  if (years.length === 0) {
    return []
  }

  const minCo2 = years[0]!.co2Mt
  const maxCo2 = years[years.length - 1]!.co2Mt
  const span = maxCo2 - minCo2
  const availableSpan = MAX_RADIUS - MIN_RADIUS

  // Each ring's radial thickness = its weighted share of the full radius.
  // No global scale-down — outer high-emission years naturally dominate.
  const weights = years.map((point) => Math.pow(point.co2Mt, WIDTH_EXPONENT))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

  let radius = MIN_RADIUS
  const rings: RingGeometry[] = []

  for (let index = 0; index < years.length; index += 1) {
    const point = years[index]!
    const width = totalWeight > 0 ? (weights[index]! / totalWeight) * availableSpan : availableSpan / years.length
    const inner = radius
    const outer = inner + width
    const norm = span > 0 ? (point.co2Mt - minCo2) / span : 0.5

    rings.push({
      year: point.year,
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
