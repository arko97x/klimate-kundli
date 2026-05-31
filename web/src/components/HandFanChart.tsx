import { useMemo, useRef, useState } from 'react'

import type { HottestYearBlade, HottestYearsInsight } from '@/lib/api'
import { cn } from '@/lib/utils'

const SCALE = 0.95
const WIDTH = Math.round(480 * SCALE)
const HEIGHT = Math.round(280 * SCALE)
const PIVOT_X = WIDTH / 2
const PIVOT_Y = HEIGHT - Math.round(28 * SCALE)
const SLAT_LENGTH_SCALE = 0.92
const MAX_SLAT_R = Math.round(168 * SCALE * SLAT_LENGTH_SCALE)
/** Blades start on this inner arc — open ring at hub (ribs only in center). */
const BLADE_INNER_R = Math.round(MAX_SLAT_R * 0.25)
/** Short stub below pivot along each rib midline (clipped at hub, not a long tail). */
const RIB_TAIL_R = Math.round(7 * SCALE)
/** Tight crop — removes empty SVG band above slats (was the big caption→fan gap). */
const VIEW_PAD_TOP = 8
const VIEW_PAD_SIDE = 10
const VIEW_PAD_BOTTOM = 10
const VIEW_MIN_X = PIVOT_X - MAX_SLAT_R - VIEW_PAD_SIDE
const VIEW_MIN_Y = PIVOT_Y - MAX_SLAT_R - VIEW_PAD_TOP
const VIEW_WIDTH = (MAX_SLAT_R + VIEW_PAD_SIDE) * 2
const VIEW_HEIGHT = MAX_SLAT_R + VIEW_PAD_TOP + VIEW_PAD_BOTTOM
/** Fan arc span (degrees), centered upward (−π/2 in SVG y-down). */
const FAN_ARC_DEG = 150
const FAN_ARC_SPAN = (FAN_ARC_DEG * Math.PI) / 180
const FAN_ARC_CENTER = -Math.PI / 2
const FAN_ARC_START = FAN_ARC_CENTER - FAN_ARC_SPAN / 2
/** Gap between slats as a fraction of slat width (keeps separation, still fills 180°). */
const SLAT_GAP_RATIO = 0.14
/** Neighbor slats tuck under prior by this fraction of pitch (constant radial edges). */
const SLAT_STEP_OVERLAP_RATIO = 0.22
const CITY_PALETTE = ['#c45a3a', '#3d6b7a', '#7a5c2e', '#5c4a6b', '#2d5c45']

type HandFanChartProps = {
  insight: Pick<
    HottestYearsInsight,
    'blades' | 'count' | 'recordStartYear' | 'latestCompleteYear'
  >
}

export function HandFanChart({ insight }: HandFanChartProps) {
  const { blades, count } = insight

  const cityColors = useMemo(() => {
    const cities = [...new Set(blades.map((b) => b.cityName))]
    return new Map(cities.map((name, i) => [name, CITY_PALETTE[i % CITY_PALETTE.length]]))
  }, [blades])

  const fanBlades = useMemo(() => buildFanBlades(blades, cityColors), [blades, cityColors])

  if (fanBlades.length === 0) {
    return null
  }

  return (
    <HandFanSvg fanBlades={fanBlades} count={count} />
  )
}

type FanBladeGeom = HottestYearBlade & {
  /** Peak rank among years on this fan (#1 = hottest peak). */
  rankAmongLived: number
  livedCount: number
  dOutline: string
  dHeat: string
  color: string
  outerR: number
  heatFillR: number
  midAngle: number
  a0: number
  a1: number
  a0Hit: number
  a1Hit: number
  tipX: number
  tipY: number
  ribStartX: number
  ribStartY: number
}

type HandFanSvgProps = {
  fanBlades: FanBladeGeom[]
  count: number
}

function HandFanSvg({ fanBlades, count }: HandFanSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [activeYear, setActiveYear] = useState<number | null>(null)

  const cities = [...new Set(fanBlades.map((b) => b.cityName))]
  const active = fanBlades.find((b) => b.year === activeYear) ?? null

  function hitTest(clientX: number, clientY: number): FanBladeGeom | null {
    const svg = svgRef.current
    if (!svg) return null

    const rect = svg.getBoundingClientRect()
    const x = VIEW_MIN_X + ((clientX - rect.left) / rect.width) * VIEW_WIDTH
    const y = VIEW_MIN_Y + ((clientY - rect.top) / rect.height) * VIEW_HEIGHT
    const dx = x - PIVOT_X
    const dy = y - PIVOT_Y
    const dist = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)

    return (
      fanBlades.find((blade) => {
        return (
          dist >= BLADE_INNER_R - 2 &&
          dist <= blade.outerR + 10 &&
          angle >= blade.a0Hit - 0.02 &&
          angle <= blade.a1Hit + 0.02
        )
      }) ?? null
    )
  }

  function handlePointerMove(event: { clientX: number; clientY: number }) {
    const hit = hitTest(event.clientX, event.clientY)
    setActiveYear(hit?.year ?? null)
  }

  function handlePointerLeave() {
    setActiveYear(null)
  }

  return (
    <div className="space-y-3">
      <div
        className="relative mx-auto w-full max-w-2xl"
        onPointerLeave={handlePointerLeave}
      >
        <svg
          ref={svgRef}
          viewBox={`${VIEW_MIN_X} ${VIEW_MIN_Y} ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className="mx-auto block h-auto w-full max-w-2xl touch-none"
          role="img"
          aria-label={`${count} record-hot years. Each slat is one year; shaded height is peak temperature.`}
          onPointerMove={handlePointerMove}
        >
          <defs>
            <filter id="fan-slat-shadow" x="-35%" y="-35%" width="170%" height="170%">
              <feDropShadow dx="0.5" dy="1.25" stdDeviation="1.1" floodColor="#1a1028" floodOpacity="0.22" />
            </filter>
          </defs>

          {/* Ribs beneath blade fills */}
          {fanBlades
            .filter((blade) => activeYear == null || blade.year !== activeYear)
            .map((blade) => (
              <line
                key={`rib-${blade.year}`}
                x1={blade.ribStartX}
                y1={blade.ribStartY}
                x2={blade.tipX}
                y2={blade.tipY}
                stroke={blade.color}
                strokeWidth={activeYear == null ? 2.25 : 1.9}
                strokeLinecap="round"
                opacity={activeYear == null ? 1 : 0.18}
                pointerEvents="none"
              />
            ))}
          {fanBlades
            .filter((blade) => blade.year === activeYear)
            .map((blade) => (
              <line
                key={`rib-active-${blade.year}`}
                x1={blade.ribStartX}
                y1={blade.ribStartY}
                x2={blade.tipX}
                y2={blade.tipY}
                stroke={blade.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                pointerEvents="none"
              />
            ))}

          {fanBlades
            .filter((blade) => activeYear == null || blade.year !== activeYear)
            .map((blade) => (
              <g
                key={blade.year}
                opacity={activeYear == null ? 1 : 0.32}
                filter="url(#fan-slat-shadow)"
                className="transition-opacity duration-150"
                onPointerEnter={() => setActiveYear(blade.year)}
              >
                <path
                  d={blade.dOutline}
                  fill="#faf7f2"
                  stroke={blade.color}
                  strokeWidth={activeYear == null ? 1.05 : 0.75}
                />
                <path d={blade.dHeat} fill={blade.color} fillOpacity={0.5} stroke="none" />
              </g>
            ))}
          {fanBlades
            .filter((blade) => blade.year === activeYear)
            .map((blade) => (
              <g
                key={`active-${blade.year}`}
                filter="url(#fan-slat-shadow)"
                className="transition-opacity duration-150"
                onPointerEnter={() => setActiveYear(blade.year)}
              >
                <path d={blade.dOutline} fill="#faf7f2" stroke={blade.color} strokeWidth={1.05} />
                <path d={blade.dHeat} fill={blade.color} fillOpacity={1} stroke="none" />
              </g>
            ))}

        </svg>

        <DetailLine active={active} reserveBlade={longestDetailBlade(fanBlades)} />
      </div>

      {/* Timeline — readable years, no overlap on fan */}
      <div
        className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-1.5"
        role="list"
        aria-label="Record-hot years"
      >
        {fanBlades.map((blade) => (
          <button
            key={blade.year}
            type="button"
            role="listitem"
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors',
              activeYear === blade.year
                ? 'border-foreground/25 bg-foreground text-background'
                : 'border-border bg-muted/40 text-foreground hover:bg-muted',
            )}
            style={
              activeYear === blade.year
                ? { backgroundColor: blade.color, borderColor: blade.color, color: '#faf7f2' }
                : undefined
            }
            onPointerEnter={() => setActiveYear(blade.year)}
            onFocus={() => setActiveYear(blade.year)}
            onBlur={() => setActiveYear(null)}
            onClick={() => setActiveYear(blade.year)}
          >
            {blade.year}
          </button>
        ))}
      </div>

      {cities.length > 1 ? (
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
          {cities.map((city) => (
            <span key={city} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: fanBlades.find((b) => b.cityName === city)?.color }}
                aria-hidden
              />
              {city}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function slatLayout(n: number): { slatWidth: number; gap: number } {
  if (n <= 0) {
    return { slatWidth: 0, gap: 0 }
  }
  if (n === 1) {
    return { slatWidth: FAN_ARC_SPAN, gap: 0 }
  }
  const slatWidth = FAN_ARC_SPAN / (n + (n - 1) * SLAT_GAP_RATIO)
  const gap = slatWidth * SLAT_GAP_RATIO
  return { slatWidth, gap }
}

function buildFanBlades(
  blades: HottestYearBlade[],
  cityColors: Map<string, string>,
): FanBladeGeom[] {
  if (blades.length === 0) return []

  const perCityRange = new Map<string, { min: number; max: number }>()
  for (const blade of blades) {
    const entry = perCityRange.get(blade.cityName) ?? { min: blade.peakTempC, max: blade.peakTempC }
    entry.min = Math.min(entry.min, blade.peakTempC)
    entry.max = Math.max(entry.max, blade.peakTempC)
    perCityRange.set(blade.cityName, entry)
  }

  const n = blades.length
  const { slatWidth, gap } = slatLayout(n)
  const pitch = slatWidth + gap
  const stepOverlap = pitch * SLAT_STEP_OVERLAP_RATIO
  const step = pitch - stepOverlap
  /** Inset both ends equally when overlap shortens span (keeps fan centered on −π/2). */
  const tuckShortfall = (n - 1) * stepOverlap
  const arcStart = FAN_ARC_START + tuckShortfall / 2
  const livedCount = blades.length
  const peakRankByYear = rankLivedYearsByPeak(blades)

  return blades.map((blade, i) => {
    const a0 = arcStart + i * step
    const a1 = a0 + slatWidth
    const hitPad = slatWidth * 0.1
    const a0Hit = a0 - hitPad
    const a1Hit = a1 + hitPad
    const midAngle = (a0 + a1) / 2

    const range = perCityRange.get(blade.cityName)!
    const tempSpan = range.max - range.min
    const heat = tempSpan > 0 ? (blade.peakTempC - range.min) / tempSpan : 1
    const outerR = MAX_SLAT_R
    const heatFillR = Math.max(
      BLADE_INNER_R + 10,
      BLADE_INNER_R + heat * (outerR - BLADE_INNER_R),
    )

    const color = cityColors.get(blade.cityName) ?? CITY_PALETTE[0]
    const { tipX, tipY, ribStartX, ribStartY } = ribLineEndpoints(midAngle, outerR)

    return {
      ...blade,
      rankAmongLived: peakRankByYear.get(blade.year) ?? 1,
      livedCount,
      dOutline: ringSlatPath(PIVOT_X, PIVOT_Y, a0, a1, BLADE_INNER_R, outerR),
      dHeat: ringSlatPath(PIVOT_X, PIVOT_Y, a0, a1, BLADE_INNER_R, heatFillR),
      color,
      outerR,
      heatFillR,
      midAngle,
      a0,
      a1,
      a0Hit,
      a1Hit,
      tipX,
      tipY,
      ribStartX,
      ribStartY,
    }
  })
}

/** Rib on blade midline: short stub past pivot, then through hub to tip. */
function ribLineEndpoints(midAngle: number, outerR: number) {
  const cos = Math.cos(midAngle)
  const sin = Math.sin(midAngle)
  const tStart = -RIB_TAIL_R

  return {
    tipX: PIVOT_X + cos * outerR,
    tipY: PIVOT_Y + sin * outerR,
    ribStartX: PIVOT_X + cos * tStart,
    ribStartY: PIVOT_Y + sin * tStart,
  }
}

/** Blade panel between inner and outer arc (parallel radial sides). */
function ringSlatPath(
  cx: number,
  cy: number,
  a0: number,
  a1: number,
  rInner: number,
  rOuter: number,
): string {
  const xi0 = cx + Math.cos(a0) * rInner
  const yi0 = cy + Math.sin(a0) * rInner
  const xo0 = cx + Math.cos(a0) * rOuter
  const yo0 = cy + Math.sin(a0) * rOuter
  const xo1 = cx + Math.cos(a1) * rOuter
  const yo1 = cy + Math.sin(a1) * rOuter
  const xi1 = cx + Math.cos(a1) * rInner
  const yi1 = cy + Math.sin(a1) * rInner
  const largeOuter = a1 - a0 > Math.PI ? 1 : 0
  const largeInner = a1 - a0 > Math.PI ? 1 : 0

  return [
    `M ${xi0} ${yi0}`,
    `L ${xo0} ${yo0}`,
    `A ${rOuter} ${rOuter} 0 ${largeOuter} 1 ${xo1} ${yo1}`,
    `L ${xi1} ${yi1}`,
    `A ${rInner} ${rInner} 0 ${largeInner} 0 ${xi0} ${yi0}`,
    'Z',
  ].join(' ')
}

/** #1 = hottest peak among slats on this fan. */
function rankLivedYearsByPeak(blades: HottestYearBlade[]): Map<number, number> {
  const sorted = [...blades].sort((a, b) => b.peakTempC - a.peakTempC || a.year - b.year)
  const ranks = new Map<number, number>()
  for (let i = 0; i < sorted.length; i++) {
    ranks.set(sorted[i].year, i + 1)
  }
  return ranks
}

function longestDetailBlade(blades: FanBladeGeom[]): FanBladeGeom | null {
  if (blades.length === 0) return null
  return blades.reduce((longest, blade) =>
    detailLineLength(blade) > detailLineLength(longest) ? blade : longest,
  )
}

function detailLineLength(blade: FanBladeGeom): number {
  return `${blade.year} · ${blade.cityName} · ${blade.peakTempC.toFixed(1)}°C · ${formatPeakDate(blade.peakDate)} · #${blade.rankAmongLived}/${blade.livedCount}`
    .length
}

function DetailLine({
  active,
  reserveBlade,
}: {
  active: FanBladeGeom | null | undefined
  reserveBlade: FanBladeGeom | null
}) {
  const ghost = reserveBlade ?? active

  return (
    <div className="relative mt-3">
      {ghost ? (
        <p className="pointer-events-none text-center text-sm tabular-nums invisible" aria-hidden>
          <BladeDetailContent blade={ghost} />
        </p>
      ) : null}
      <p
        className="absolute inset-0 flex items-center justify-center text-center text-sm tabular-nums"
        aria-live="polite"
      >
        {active ? (
          <BladeDetailContent blade={active} />
        ) : (
          <span className="text-muted-foreground">Pick a slat or year</span>
        )}
      </p>
    </div>
  )
}

function BladeDetailContent({ blade }: { blade: FanBladeGeom }) {
  const peakSource = blade.peakSource ?? 'era5_grid'
  const peakNote =
    peakSource === 'imd_station' && blade.imdStationName
      ? ` · IMD ${blade.imdStationName}`
      : blade.isIndiaHome
        ? ' · ERA5 grid (not station)'
        : ''

  return (
    <>
      <span className="font-medium">{blade.year}</span>
      <span className="text-muted-foreground">
        {' '}
        · {blade.cityName} · {blade.peakTempC.toFixed(1)}°C
        {blade.peakDate ? ` · ${formatPeakDate(blade.peakDate)}` : ''} · #{blade.rankAmongLived}/
        {blade.livedCount}
        {peakNote}
      </span>
    </>
  )
}

function formatPeakDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) {
    return iso
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
