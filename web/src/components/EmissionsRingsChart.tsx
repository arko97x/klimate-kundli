import { useMemo, useRef, useState } from 'react'
import { Calendar, Info, TrendingUp, Activity } from 'lucide-react'

import type { IndiaEmissionsRings, GlobalContext } from '@/lib/api'

const SIZE = 400
const CENTER = SIZE / 2


type EmissionsRingsChartProps = {
  birthYear: number
  data: IndiaEmissionsRings
  parentsData?: IndiaEmissionsRings | null
  globalContext?: GlobalContext | null
}

type RingGeometry = {
  year: number
  co2Mt: number
  yTop: number
  yBottom: number
  wTop: number
  wBottom: number
  points: string
  color: string
  isShared: boolean
}

type Branch = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  w: number
}

// Procedural fractal bronchial airway generator
function buildBronchioles(
  startX: number,
  startY: number,
  angle: number,
  length: number,
  depth: number,
  prefix: string,
): Branch[] {
  const branches: Branch[] = []

  function recurse(
    x: number,
    y: number,
    a: number,
    l: number,
    d: number,
    idPrefix: string,
  ) {
    if (d === 0) return

    const rad = (a * Math.PI) / 180
    const x2 = x + l * Math.cos(rad)
    const y2 = y + l * Math.sin(rad)

    branches.push({
      id: `${idPrefix}-${d}-${branches.length}`,
      x1: x,
      y1: y,
      x2,
      y2,
      w: d * 0.65,
    })

    const nextL = l * 0.74
    recurse(x2, y2, a - 28, nextL, d - 1, `${idPrefix}L`)
    recurse(x2, y2, a + 28, nextL, d - 1, `${idPrefix}R`)
  }

  recurse(startX, startY, angle, length, depth, prefix)
  return branches
}

export function EmissionsRingsChart({ birthYear, data, parentsData, globalContext }: EmissionsRingsChartProps) {
  const hasComparison = parentsData != null && parentsData.years.length > 0
  const parentsBirthYear = hasComparison ? (parentsData?.startYear ?? birthYear - 25) : birthYear - 25

  // Use the longest dataset available for the unified timeline
  const baseYears = useMemo(() => {
    return hasComparison ? parentsData.years : data.years
  }, [hasComparison, parentsData, data])

  // Shared color scale min/max across all available years
  const colorScale = useMemo(() => {
    const values = baseYears.map((p) => p.co2Mt)
    if (values.length === 0) {
      return { min: 0, max: 1 }
    }
    return { min: Math.min(...values), max: Math.max(...values) }
  }, [baseYears])

  // Generate the wiggled/constrained diamond year polygons
  const rings = useMemo(() => {
    return buildRingGeometry(
      baseYears,
      colorScale.min,
      colorScale.max,
      birthYear,
    )
  }, [baseYears, colorScale.min, colorScale.max, birthYear])

  // Locate the birth year ring to draw the boundary divider line
  const birthRing = useMemo(() => {
    return rings.find((r) => r.year === birthYear)
  }, [rings, birthYear])

  // Pre-generate procedural bronchiole airway trees
  const leftLung = useMemo(() => buildBronchioles(194, 110, 145, 42, 5, 'left'), [])
  const rightLung = useMemo(() => buildBronchioles(206, 110, 35, 42, 5, 'right'), [])

  const [hoveredYear, setHoveredYear] = useState<number | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  // Fallback to the latest year's data if no year is hovered or selected
  const activeYear = hoveredYear ?? selectedYear ?? data.endYear
  const activeRing = rings.find((r) => r.year === activeYear)
  const activeCo2 = activeRing?.co2Mt ?? 0

  // Key stats for milestones
  const parentsBirthCo2 = baseYears[0]?.co2Mt ?? 0
  const attendeeBirthCo2 = baseYears.find((y) => y.year === birthYear)?.co2Mt ?? 0
  const latestCo2 = data.lastCo2Mt

  // Multiplier ratios
  const ratioToParentsBirth = parentsBirthCo2 > 0 ? activeCo2 / parentsBirthCo2 : 0
  const ratioToAttendeeBirth = attendeeBirthCo2 > 0 ? activeCo2 / attendeeBirthCo2 : 0

  const latestRatioToAttendeeBirth = attendeeBirthCo2 > 0 ? latestCo2 / attendeeBirthCo2 : 0
  const latestRatioToParentsBirth = parentsBirthCo2 > 0 ? latestCo2 / parentsBirthCo2 : 0

  const attendeeGrowth =
    data.growthFactor != null
      ? `${data.growthFactor}× higher than the year you were born`
      : 'higher now than when you were born'
  const parentsGrowth =
    parentsData?.growthFactor != null
      ? `${parentsData.growthFactor}× higher than when they were born`
      : 'higher now than when they were born'

  // Silence unused local variable checks
  void [attendeeGrowth, parentsGrowth]

  // Climate global CO2 ppm lookup
  const parentsCo2 = useMemo(() => getCo2Ppm(parentsBirthYear), [parentsBirthYear])
  const yourCo2 = useMemo(() => globalContext?.co2PpmAtBirth ?? getCo2Ppm(birthYear), [globalContext, birthYear])
  const todayCo2 = useMemo(() => globalContext?.co2PpmNow ?? getCo2Ppm(data.endYear), [globalContext, data.endYear])

  function getYourAgeLabel(year: number) {
    if (year < birthYear) return 'Not yet born'
    if (year === birthYear) return 'Born'
    return `Age ${year - birthYear}`
  }

  function getParentsAgeLabel(year: number) {
    return `Age ${year - parentsBirthYear}`
  }

  // Milestones list for the right dashboard panel
  const milestones = [
    ...(hasComparison
      ? [
          {
            label: "Parents' Birth Year",
            year: parentsBirthYear,
            co2: parentsBirthCo2,
            growthText: 'Baseline',
            isActive: activeYear === parentsBirthYear,
          },
        ]
      : []),
    {
      label: 'Your Birth Year',
      year: birthYear,
      co2: attendeeBirthCo2,
      growthText: hasComparison ? `${(attendeeBirthCo2 / parentsBirthCo2).toFixed(1)}× baseline` : 'Baseline',
      isActive: activeYear === birthYear,
    },
    {
      label: 'Today',
      year: data.endYear,
      co2: latestCo2,
      growthText: `${latestRatioToAttendeeBirth.toFixed(1)}× since birth`,
      isActive: activeYear === data.endYear,
    },
  ]

  return (
    <section className="space-y-6 pb-6">
      <div className="space-y-3">
        <h3 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl text-pretty">
          India&apos;s carbon emissions across your lifetime
        </h3>
        <p className="max-w-3xl text-pretty text-sm text-muted-foreground leading-relaxed select-none">
          {hasComparison ? (
            <>
              Same national CO₂ story, two starting years — you from {data.startYear}, your parents&apos; generation
              from {parentsData?.startYear}. Both run to {data.endYear}. India&apos;s emissions are {data.growthFactor}×{' '}
              higher than when you were born for you and {parentsData?.growthFactor}× higher for them.
            </>
          ) : (
            <>
              National CO₂ from {data.startYear} to {data.endYear} — {formatMt(data.firstCo2Mt)} Mt in{' '}
              {data.startYear}, {formatMt(data.lastCo2Mt)} Mt in {data.endYear}. India&apos;s emissions are{' '}
              {data.growthFactor}× higher today.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-12 items-start mt-6">
        {/* LEFT COLUMN: Diamond Negative Space Lung Visualization */}
        <div className="lg:col-span-7 flex flex-col items-center select-none">
          <div className="relative w-full max-w-sm aspect-square bg-muted/5 rounded-2xl border border-border/60 p-4 shadow-sm flex items-center justify-center overflow-hidden">
            
            {/* Metaphor Indicator Overlay at Top Left */}
            <div className="absolute top-3 left-3 bg-background/85 backdrop-blur-xs px-2.5 py-1 rounded-md border border-border/80 text-[10px] text-muted-foreground flex items-center gap-1.5 z-10">
              <Activity className="size-3 text-red-500" />
              <span>Negative Space Lungs</span>
            </div>

            <svg
              ref={svgRef}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="h-auto w-full touch-none overflow-visible"
              role="img"
              aria-label={`Carbon emissions plume and negative space lung lobes from ${baseYears[0]?.year} to ${data.endYear}.`}
            >
              <defs>
                {/* Clip path inside the square diamond */}
                <clipPath id="diamond-clip">
                  <polygon points="200,12 388,200 200,388 12,200" />
                </clipPath>
              </defs>

              {/* Clipped group containing background, bronchial trees, and plume */}
              <g clipPath="url(#diamond-clip)">
                {/* Diamond Background */}
                <polygon points="200,12 388,200 200,388 12,200" fill="var(--color-muted)" fillOpacity={0.2} />

                {/* Bronchiole branches (Negative space lungs layout) */}
                <g opacity={0.6}>
                  {leftLung.map((b) => (
                    <line
                      key={b.id}
                      x1={b.x1}
                      y1={b.y1}
                      x2={b.x2}
                      y2={b.y2}
                      stroke="currentColor"
                      strokeOpacity={0.16}
                      strokeWidth={b.w}
                      strokeLinecap="round"
                    />
                  ))}
                  {rightLung.map((b) => (
                    <line
                      key={b.id}
                      x1={b.x1}
                      y1={b.y1}
                      x2={b.x2}
                      y2={b.y2}
                      stroke="currentColor"
                      strokeOpacity={0.16}
                      strokeWidth={b.w}
                      strokeLinecap="round"
                    />
                  ))}
                </g>

                {/* Central Carbon Emissions Plume (Trapezoid segments) */}
                {rings.map((ring) => {
                  const isHovered = hoveredYear === ring.year
                  const isSelected = selectedYear === ring.year

                  let opacity = 0.95
                  if (hoveredYear != null) {
                    opacity = isHovered ? 1.0 : 0.4
                  } else if (selectedYear != null) {
                    opacity = isSelected ? 1.0 : 0.65
                  } else {
                    if (hasComparison && !ring.isShared) {
                      opacity = 0.75
                    }
                  }

                  return (
                    <polygon
                      key={ring.year}
                      points={ring.points}
                      fill={ring.color}
                      stroke={ring.color}
                      strokeWidth={0.5} // prevents anti-aliasing seams
                      opacity={opacity}
                      className="cursor-pointer transition-all duration-100 ease-out"
                      onPointerOver={(e) => {
                        setHoveredYear(ring.year)
                        const rect = svgRef.current?.getBoundingClientRect()
                        if (rect) {
                          setTooltipPos({
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top,
                          })
                        }
                      }}
                      onPointerLeave={() => setHoveredYear(null)}
                      onClick={() => setSelectedYear(ring.year)}
                    />
                  )
                })}
              </g>

              {/* Dashed Birth Year Boundary Divider (drawn outside clip so it sits on top cleanly) */}
              {hasComparison && birthRing && (
                <line
                  x1={CENTER - birthRing.wTop}
                  y1={birthRing.yTop}
                  x2={CENTER + birthRing.wTop}
                  y2={birthRing.yTop}
                  stroke="var(--color-foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  opacity={0.8}
                  pointerEvents="none"
                />
              )}

              {/* Active Year Overlay (Drawn last to maintain clean borders) */}
              {activeRing && (
                <polygon
                  points={activeRing.points}
                  fill="none"
                  stroke="var(--color-foreground)"
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              )}

              {/* Crisp border frame around the rotated diamond */}
              <polygon
                points="200,12 388,200 200,388 12,200"
                fill="none"
                stroke="var(--color-border)"
                strokeWidth={2}
                pointerEvents="none"
              />
            </svg>

            {/* Float Tooltip */}
            {hoveredYear && (
              <div
                className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow-sm tabular-nums text-popover-foreground transition-all duration-75 select-none"
                style={{ left: tooltipPos.x, top: tooltipPos.y - 12 }}
              >
                <div className="font-semibold">{hoveredYear}</div>
                <div className="opacity-90 text-[10px]">{formatMt(baseYears.find((y) => y.year === hoveredYear)?.co2Mt ?? 0)} Mt CO₂</div>
              </div>
            )}
          </div>

          {/* Color Scale Legend */}
          <div className="mt-4 flex flex-col items-center gap-1.5 w-full max-w-sm px-2">
            <div className="flex justify-between text-[10px] text-muted-foreground w-full">
              <span>{baseYears[0]?.year} ({formatMt(parentsBirthCo2)} Mt)</span>
              <span>Today ({formatMt(latestCo2)} Mt)</span>
            </div>
            <div
              className="h-2 w-full rounded-full bg-linear-to-r from-[#5584ac] via-[#7b1fa2] via-[#c2185b] to-[#b71c1c]"
              aria-hidden
            />
            <div className="text-[10px] text-muted-foreground/80 flex items-center justify-center gap-1 mt-0.5 select-none">
              <span>Carbon Plume (gradient) constricts air spaces (negative space lungs)</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Narrative Panel */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-xs">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="size-3.5 text-primary" />
              <span>Interactive Story Timeline</span>
            </h4>

            {/* Clickable Milestones Grid */}
            <div className="grid gap-2.5">
              {milestones.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => {
                    setSelectedYear(m.year)
                    setHoveredYear(null)
                  }}
                  onPointerOver={() => setHoveredYear(m.year)}
                  onPointerOut={() => setHoveredYear(null)}
                  className={`w-full text-left p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                    m.isActive
                      ? 'border-primary bg-primary/5 shadow-xs'
                      : 'border-border/80 bg-muted/15 hover:bg-muted/30 hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {m.label}
                      </p>
                      <h5 className="font-heading text-2xl font-bold text-foreground leading-tight mt-0.5">
                        {m.year}
                      </h5>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formatMt(m.co2)} Mt
                      </span>
                      <p className="text-[10px] text-muted-foreground/90 mt-0.5 font-medium tabular-nums">
                        {m.growthText}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Active Details Snapshot Card */}
            <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3.5 transition-all duration-300">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Calendar className="size-3.5 text-primary" />
                  <span>Year Snapshot</span>
                </div>
                <span className="font-bold font-heading text-3xl text-primary tabular-nums">
                  {activeYear}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-border/60 pt-3">
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
                    India&apos;s CO₂
                  </p>
                  <p className="text-base font-bold text-foreground tabular-nums mt-0.5">
                    {formatMt(activeCo2)} <span className="text-xs font-normal text-muted-foreground">Mt</span>
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Growth vs Baseline
                  </p>
                  <p className="text-base font-bold text-foreground tabular-nums mt-0.5">
                    {ratioToParentsBirth > 1 ? `${ratioToParentsBirth.toFixed(1)}×` : 'Baseline'}
                    <span className="text-[9px] font-normal text-muted-foreground block text-pretty leading-tight">
                      {activeYear === parentsBirthYear ? 'Parents\' birth year' : `compared to ${parentsBirthYear}`}
                    </span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-border/60 pt-3">
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Your Age</p>
                  <p className="text-xs font-semibold text-foreground mt-0.5">
                    {getYourAgeLabel(activeYear)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Parents&apos; Age</p>
                  <p className="text-xs font-semibold text-foreground mt-0.5">
                    {getParentsAgeLabel(activeYear)}
                  </p>
                </div>
              </div>

              {/* Dynamic comparison narrative block */}
              <div className="border-t border-border/60 pt-3 text-xs text-muted-foreground leading-relaxed text-pretty">
                {activeYear === birthYear ? (
                  <span>
                    In <strong>{activeYear}</strong>, the year you were born, global CO₂ was <strong>{yourCo2} ppm</strong>. India emitted{' '}
                    <strong>{formatMt(activeCo2)} Mt</strong> of CO₂.
                    {hasComparison && (
                      <>
                        {' '}This was already <strong>{ratioToParentsBirth.toFixed(1)}×</strong> higher than when your parents were born (global CO₂ was <strong>{parentsCo2} ppm</strong>).
                      </>
                    )}
                  </span>
                ) : activeYear === data.endYear ? (
                  <span>
                    Today (<strong>{activeYear}</strong>), global CO₂ stands at <strong>{todayCo2} ppm</strong>. India&apos;s emissions are{' '}
                    <strong>{formatMt(activeCo2)} Mt</strong> — an increase of{' '}
                    <strong>{latestRatioToAttendeeBirth.toFixed(1)}×</strong> since your birth year
                    {hasComparison && (
                      <>
                        , and <strong>{latestRatioToParentsBirth.toFixed(1)}×</strong> since your parents were born (when global CO₂ was <strong>{parentsCo2} ppm</strong>).
                      </>
                    )}
                  </span>
                ) : activeYear < birthYear ? (
                  <span>
                    In <strong>{activeYear}</strong>, before you were born, global CO₂ was <strong>{getCo2Ppm(activeYear)} ppm</strong>. Your parents were{' '}
                    <strong>{activeYear - parentsBirthYear}</strong> years old. India&apos;s carbon footprint was{' '}
                    <strong>{formatMt(activeCo2)} Mt</strong>.
                  </span>
                ) : (
                  <span>
                    When you were <strong>{activeYear - birthYear}</strong> years old (in <strong>{activeYear}</strong>), global CO₂ was <strong>{getCo2Ppm(activeYear)} ppm</strong>. India&apos;s emissions had grown to{' '}
                    <strong>{formatMt(activeCo2)} Mt</strong> — which is{' '}
                    <strong>{ratioToAttendeeBirth.toFixed(1)}×</strong> higher than when you were born.
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2 items-start text-[10px] text-muted-foreground leading-normal bg-muted/10 p-2.5 rounded-lg border border-border/40 text-pretty select-none mt-1">
              <Info className="size-4 text-primary shrink-0 mt-0.5" />
              <span>
                <strong>Interpretation:</strong> The diamond shapes your timeline from birth (top) to present (bottom). As carbon emissions grow (red flare), they physically crowd out the light grey breathing spaces representing the lungs.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function buildRingGeometry(
  years: { year: number; co2Mt: number }[],
  colorMin: number,
  colorMax: number,
  birthYear: number,
): RingGeometry[] {
  if (years.length === 0) {
    return []
  }

  const N = years.length
  const yMin = 12
  const yMax = 388
  const colorSpan = colorMax - colorMin
  const maxCo2 = Math.max(...years.map((y) => y.co2Mt))

  // Sizing parameters
  const minHalfW = 4
  const maxPlumeHalfW = 100

  const rings: RingGeometry[] = []

  for (let i = 0; i < N; i += 1) {
    const point = years[i]!
    const yTop = yMin + (i / N) * (yMax - yMin)
    const yBottom = yMin + ((i + 1) / N) * (yMax - yMin)

    // Emissions value at top and bottom of slice
    const co2Top = point.co2Mt
    const co2Bottom = i < N - 1 ? years[i + 1]!.co2Mt : maxCo2

    // Target half widths
    const emissionsHalfWTop = minHalfW + (co2Top / maxCo2) * (maxPlumeHalfW - minHalfW)
    const emissionsHalfWBottom = minHalfW + (co2Bottom / maxCo2) * (maxPlumeHalfW - minHalfW)

    // Constrain by diamond boundaries
    const maxHalfWTop = Math.min(yTop - yMin, yMax - yTop)
    const maxHalfWBottom = Math.min(yBottom - yMin, yMax - yBottom)

    const wTop = Math.max(1.5, Math.min(emissionsHalfWTop, maxHalfWTop))
    const wBottom = Math.max(1.5, Math.min(emissionsHalfWBottom, maxHalfWBottom))

    const pointsStr = [
      `${CENTER - wTop},${yTop}`,
      `${CENTER + wTop},${yTop}`,
      `${CENTER + wBottom},${yBottom}`,
      `${CENTER - wBottom},${yBottom}`,
    ].join(' ')

    const norm = colorSpan > 0 ? (point.co2Mt - colorMin) / colorSpan : 0.5

    rings.push({
      year: point.year,
      co2Mt: point.co2Mt,
      yTop,
      yBottom,
      wTop,
      wBottom,
      points: pointsStr,
      color: emissionColor(norm),
      isShared: point.year >= birthYear,
    })
  }

  return rings
}

const CO2_LOOKUP: { [year: number]: number } = {
  1950: 310,
  1960: 317,
  1970: 325,
  1975: 331,
  1978: 335,
  1980: 338,
  1983: 343,
  1985: 346,
  1988: 351,
  1990: 354,
  1993: 357,
  1995: 360,
  1998: 366,
  2000: 369,
  2003: 375,
  2005: 379,
  2008: 385,
  2010: 389,
  2013: 396,
  2015: 400,
  2018: 408,
  2020: 414,
  2023: 421,
  2024: 424,
}

function getCo2Ppm(year: number): number {
  if (CO2_LOOKUP[year] !== undefined) {
    return CO2_LOOKUP[year]!
  }
  const years = Object.keys(CO2_LOOKUP).map(Number).sort((a, b) => a - b)
  if (year <= years[0]!) return CO2_LOOKUP[years[0]!]!
  if (year >= years[years.length - 1]!) return CO2_LOOKUP[years[years.length - 1]!]!

  let lower = years[0]!
  let upper = years[years.length - 1]!
  for (let i = 0; i < years.length - 1; i += 1) {
    if (year >= years[i]! && year <= years[i + 1]!) {
      lower = years[i]!
      upper = years[i + 1]!
      break
    }
  }
  const t = (year - lower) / (upper - lower)
  const val = CO2_LOOKUP[lower]! + t * (CO2_LOOKUP[upper]! - CO2_LOOKUP[lower]!)
  return Math.round(val)
}

function hashLabel(label: string): number {
  let hash = 0
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  }
  return hash
}

// Silence unused local variable check
void [hashLabel]

function emissionColor(norm: number): string {
  if (norm < 0.3) {
    return mixHex('#5584ac', '#7b1fa2', norm / 0.3) // Blue to Purple
  }
  if (norm < 0.7) {
    return mixHex('#7b1fa2', '#c2185b', (norm - 0.3) / 0.4) // Purple to Rose
  }
  return mixHex('#c2185b', '#b71c1c', (norm - 0.7) / 0.3) // Rose to Crimson
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
