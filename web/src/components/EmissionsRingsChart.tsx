import { useMemo, useRef, useState } from 'react'
import { Calendar, Trees, Info, TrendingUp, Wind } from 'lucide-react'

import type { IndiaEmissionsRings, GlobalContext } from '@/lib/api'
import { parallelAnnulusPath, permutationForSeed, sharedWiggleOffset } from '@/lib/organicTreeRing'

const SIZE = 400
const CENTER = SIZE / 2
const MIN_RADIUS = 36
const MAX_RADIUS = 180
const WIDTH_EXPONENT = 1.2

// Atmospheric global CO2 ppm Mauna Loa historical reference points
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

type Particle = {
  id: string
  x: number
  y: number
  r: number
  xWiggle: number
  yWiggle: number
  duration: number
  delay: number
}

function generateParticles(seed: number, co2Count: number, sootCount: number) {
  let state = seed
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return (state & 0xffffff) / 0x1000000
  }

  const co2: Particle[] = []
  for (let i = 0; i < co2Count; i += 1) {
    co2.push({
      id: `co2-${seed}-${i}`,
      x: 18 + random() * 74,
      y: 25 + random() * 170,
      r: 1.2 + random() * 1.6,
      xWiggle: -8 + random() * 16,
      yWiggle: -12 + random() * 24,
      duration: 3.5 + random() * 4,
      delay: -random() * 5,
    })
  }

  const soot: Particle[] = []
  for (let i = 0; i < sootCount; i += 1) {
    soot.push({
      id: `soot-${seed}-${i}`,
      x: 18 + random() * 74,
      y: 25 + random() * 170,
      r: 0.8 + random() * 1.2,
      xWiggle: -6 + random() * 12,
      yWiggle: -10 + random() * 20,
      duration: 4.5 + random() * 5,
      delay: -random() * 5,
    })
  }

  return { co2, soot }
}

type EmissionsRingsChartProps = {
  birthYear: number
  data: IndiaEmissionsRings
  parentsData?: IndiaEmissionsRings | null
  globalContext?: GlobalContext | null
}

type RingGeometry = {
  year: number
  co2Mt: number
  innerR: number
  outerR: number
  d: string
  color: string
  isShared: boolean
}

export function EmissionsRingsChart({ birthYear, data, parentsData, globalContext }: EmissionsRingsChartProps) {
  const [activeTab, setActiveTab] = useState<'rings' | 'breath'>('rings')
  
  const hasComparison = parentsData != null && parentsData.years.length > 0
  const parentsBirthYear = hasComparison ? (parentsData?.startYear ?? birthYear - 25) : birthYear - 25

  // Seed wiggle noise stably from the country name
  const wigglePerm = useMemo(
    () => permutationForSeed(hashLabel(data.country || 'India')),
    [data.country],
  )

  // Use the longest dataset available for the unified tree
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

  // Generate organic wiggled ring geometry
  const rings = useMemo(() => {
    return buildRingGeometry(
      baseYears,
      colorScale.min,
      colorScale.max,
      wigglePerm,
      birthYear,
    )
  }, [baseYears, colorScale.min, colorScale.max, wigglePerm, birthYear])

  // Locate the birth year ring to draw the dashed boundary
  const birthRing = useMemo(() => {
    return rings.find((r) => r.year === birthYear)
  }, [rings, birthYear])

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

  // Precision wiggled hit-test calculation
  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg || rings.length === 0) return

    const rect = svg.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * SIZE
    const y = ((event.clientY - rect.top) / rect.height) * SIZE

    const dx = x - CENTER
    const dy = y - CENTER
    const clientRadius = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)

    // Reverse the wiggle translation to get the base radius
    const w = sharedWiggleOffset(angle, wigglePerm)
    const baseRadius = clientRadius - w

    const ring = findRingAtRadius(rings, baseRadius)
    setHoveredYear(ring?.year ?? null)
    setTooltipPos({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  function handlePointerLeave() {
    setHoveredYear(null)
  }

  function getYourAgeLabel(year: number) {
    if (year < birthYear) return 'Not yet born'
    if (year === birthYear) return 'Born'
    return `Age ${year - birthYear}`
  }

  function getParentsAgeLabel(year: number) {
    return `Age ${year - parentsBirthYear}`
  }

  // --- First Breath Calculation Logic ---
  const parentsCo2 = useMemo(() => getCo2Ppm(parentsBirthYear), [parentsBirthYear])
  const yourCo2 = useMemo(() => globalContext?.co2PpmAtBirth ?? getCo2Ppm(birthYear), [globalContext, birthYear])
  const todayCo2 = useMemo(() => globalContext?.co2PpmNow ?? getCo2Ppm(data.endYear), [globalContext, data.endYear])

  // Scale particle counts dynamically
  const parentsCo2Count = useMemo(() => Math.round((parentsCo2 - 300) * 0.3), [parentsCo2])
  const yourCo2Count = useMemo(() => Math.round((yourCo2 - 300) * 0.3), [yourCo2])
  const todayCo2Count = useMemo(() => Math.round((todayCo2 - 300) * 0.3), [todayCo2])

  const parentsSootCount = 3
  const yourSootCount = useMemo(() => Math.max(6, Math.round(3 * (attendeeBirthCo2 / parentsBirthCo2))), [attendeeBirthCo2, parentsBirthCo2])
  const todaySootCount = useMemo(() => Math.max(10, Math.round(3 * (latestCo2 / parentsBirthCo2))), [latestCo2, parentsBirthCo2])

  // Stable random positions for float simulation
  const parentsParticles = useMemo(() => generateParticles(parentsBirthYear, parentsCo2Count, parentsSootCount), [parentsBirthYear, parentsCo2Count, parentsSootCount])
  const yourParticles = useMemo(() => generateParticles(birthYear, yourCo2Count, yourSootCount), [birthYear, yourCo2Count, yourSootCount])
  const todayParticles = useMemo(() => generateParticles(data.endYear, todayCo2Count, todaySootCount), [data.endYear, todayCo2Count, todaySootCount])

  // Milestones list for the right rings panel
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
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="space-y-1">
          <h3 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl text-pretty">
            India&apos;s carbon emissions across your lifetime
          </h3>
          <p className="text-xs text-muted-foreground select-none">
            {activeTab === 'rings'
              ? 'A timeline slice of emissions growth mapped as wiggled tree rings.'
              : 'A molecular-level comparison of the air in your first breath.'}
          </p>
        </div>

        {/* Custom Tab Switcher */}
        <div className="flex p-0.5 bg-muted rounded-lg border border-border shrink-0 self-start sm:self-center select-none">
          <button
            type="button"
            onClick={() => setActiveTab('rings')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              activeTab === 'rings'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Lifetime Rings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('breath')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              activeTab === 'breath'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            First Breath
          </button>
        </div>
      </div>

      <p className="max-w-3xl text-pretty text-sm text-muted-foreground leading-relaxed select-none">
        {hasComparison ? (
          <>
            Same national CO₂ story, two starting years — you from {data.startYear}, your parents&apos; generation
            from {parentsData?.startYear}. Both run to {data.endYear}. India&apos;s emissions are {attendeeGrowth}{' '}
            for you, and {parentsGrowth} for them.
          </>
        ) : (
          <>
            National CO₂ from {data.startYear} to {data.endYear} — {formatMt(data.firstCo2Mt)} Mt in{' '}
            {data.startYear}, {formatMt(data.lastCo2Mt)} Mt in {data.endYear}. India&apos;s emissions are{' '}
            {attendeeGrowth}.
          </>
        )}
      </p>

      {activeTab === 'rings' ? (
        <div className="grid gap-8 lg:grid-cols-12 items-start mt-6">
          {/* LEFT COLUMN: The Organic Climate Tree Ring Chart */}
          <div className="lg:col-span-7 flex flex-col items-center select-none">
            <div className="relative w-full max-w-sm aspect-square bg-muted/5 rounded-2xl border border-border/60 p-4 shadow-sm flex items-center justify-center overflow-hidden">
              
              {/* Legend Overlay at Top Left */}
              <div className="absolute top-3 left-3 bg-background/85 backdrop-blur-xs px-2.5 py-1 rounded-md border border-border/80 text-[10px] text-muted-foreground flex items-center gap-1.5 z-10">
                <Trees className="size-3 text-emerald-600 dark:text-emerald-500" />
                <span>Climate Tree Slice</span>
              </div>

              <svg
                ref={svgRef}
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                className="h-auto w-full cursor-crosshair touch-none overflow-visible"
                role="img"
                aria-label={`Organic tree rings of India's yearly CO2 emissions from ${baseYears[0]?.year} to ${data.endYear}.`}
                onPointerMove={handlePointerMove}
                onPointerLeave={handlePointerLeave}
              >
                {/* Outer Bark/Container */}
                <circle cx={CENTER} cy={CENTER} r={MAX_RADIUS + 4} fill="none" stroke="currentColor" strokeOpacity={0.06} strokeWidth={2} />

                {/* Concentric Year Rings */}
                {rings.map((ring) => {
                  const isHovered = hoveredYear === ring.year
                  const isSelected = selectedYear === ring.year
                  const isActive = ring.year === activeYear

                  // Determine styling based on active interactions
                  let opacity = 0.95
                  if (hoveredYear != null) {
                    opacity = isHovered ? 1.0 : 0.45
                  } else if (selectedYear != null) {
                    opacity = isSelected ? 1.0 : 0.65
                  } else {
                    if (hasComparison && !ring.isShared) {
                      opacity = 0.75
                    }
                  }

                  return (
                    <path
                      key={ring.year}
                      d={ring.d}
                      fill={ring.color}
                      stroke={isActive ? 'var(--color-foreground)' : '#1a102815'}
                      strokeWidth={isActive ? 1.25 : 0.4}
                      opacity={opacity}
                      className="transition-all duration-150 ease-out"
                    />
                  )
                })}

                {/* Dashed Birth Year Boundary Line */}
                {hasComparison && birthRing && (
                  <path
                    d={wiggledCirclePath(CENTER, CENTER, birthRing.innerR, wigglePerm)}
                    fill="none"
                    stroke="var(--color-foreground)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    opacity={hoveredYear != null && hoveredYear < birthYear ? 0.3 : 0.7}
                    pointerEvents="none"
                  />
                )}

                {/* Heartwood Center (Birth/Start Hub) */}
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={MIN_RADIUS - 6}
                  fill={rings[0]?.color ?? '#f5d547'}
                  stroke="var(--color-foreground)"
                  strokeOpacity={0.15}
                  strokeWidth={1}
                  pointerEvents="none"
                />
                <text
                  x={CENTER}
                  y={CENTER + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="var(--color-foreground)"
                  fontSize={9}
                  fontWeight={700}
                  pointerEvents="none"
                  opacity={0.8}
                >
                  {baseYears[0]?.year}
                </text>
              </svg>

              {/* Float Tooltip on chart */}
              {hoveredYear && (
                <div
                  className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow-sm tabular-nums text-popover-foreground transition-all duration-75"
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
                className="h-2 w-full rounded-full bg-linear-to-r from-[#f5d547] via-[#d45a3a] to-[#8e3a7a]"
                aria-hidden
              />
              <div className="text-[10px] text-muted-foreground/80 flex items-center justify-center gap-1 mt-0.5">
                <span>Color scale: absolute yearly emissions (OWID)</span>
                {hasComparison && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2.5 h-1 border-t border-dashed border-foreground" />
                      Your birth
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Narrative Dashboard Panel */}
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
                      In <strong>{activeYear}</strong>, the year you were born, India emitted{' '}
                      <strong>{formatMt(activeCo2)} Mt</strong> of CO₂.
                      {hasComparison && (
                        <>
                          {' '}This was already <strong>{ratioToParentsBirth.toFixed(1)}×</strong> higher than when your parents were born.
                        </>
                      )}
                    </span>
                  ) : activeYear === data.endYear ? (
                    <span>
                      Today (<strong>{activeYear}</strong>), India&apos;s emissions stand at{' '}
                      <strong>{formatMt(activeCo2)} Mt</strong> — an increase of{' '}
                      <strong>{latestRatioToAttendeeBirth.toFixed(1)}×</strong> since your birth year
                      {hasComparison && (
                        <>
                          , and <strong>{latestRatioToParentsBirth.toFixed(1)}×</strong> since your parents were born.
                        </>
                      )}
                    </span>
                  ) : activeYear < birthYear ? (
                    <span>
                      In <strong>{activeYear}</strong>, before you were born, your parents were{' '}
                      <strong>{activeYear - parentsBirthYear}</strong> years old. India&apos;s carbon footprint was{' '}
                      <strong>{formatMt(activeCo2)} Mt</strong>.
                    </span>
                  ) : (
                    <span>
                      When you were <strong>{activeYear - birthYear}</strong> years old (in <strong>{activeYear}</strong>), India&apos;s yearly emissions had grown to{' '}
                      <strong>{formatMt(activeCo2)} Mt</strong>. That is{' '}
                      <strong>{ratioToAttendeeBirth.toFixed(1)}×</strong> higher than when you were born.
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 items-start text-[10px] text-muted-foreground leading-normal bg-muted/10 p-2.5 rounded-lg border border-border/40 text-pretty select-none">
                <Info className="size-4 text-primary shrink-0 mt-0.5" />
                <span>
                  <strong>How to read:</strong> Each organic ring represents a calendar year of India&apos;s emissions.
                  Thicker, darker bands represent higher emissions. Use the timeline buttons above or hover your mouse/finger directly over the rings to trace the growth.
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* FIRST BREATH VIEW (1-LITER GLASS BEAKERS SIMULATION) */
        <div className="grid gap-8 lg:grid-cols-12 items-start mt-6">
          {/* LEFT COLUMN: Beaker Grid Simulation */}
          <div className="lg:col-span-7 flex flex-col items-center">
            <div className="grid grid-cols-3 gap-3 sm:gap-4 w-full max-w-sm bg-muted/5 rounded-2xl border border-border/60 p-4 sm:p-5 shadow-sm justify-items-center">
              
              {/* Beaker 1: Parents Birth (e.g. 1978) */}
              {hasComparison && (
                <GlassBeaker
                  year={parentsBirthYear}
                  label="Parents' Birth"
                  co2Ppm={parentsCo2}
                  emissionsIndex={`${formatMt(parentsBirthCo2)} Mt (1.0×)`}
                  bgColorId="bg-1978"
                  co2Particles={parentsParticles.co2}
                  sootParticles={parentsParticles.soot}
                />
              )}

              {/* Beaker 2: Your Birth (e.g. 2003) */}
              <GlassBeaker
                year={birthYear}
                label="Your Birth"
                co2Ppm={yourCo2}
                emissionsIndex={`${formatMt(attendeeBirthCo2)} Mt (${(attendeeBirthCo2 / parentsBirthCo2).toFixed(1)}×)`}
                bgColorId="bg-2003"
                co2Particles={yourParticles.co2}
                sootParticles={yourParticles.soot}
              />

              {/* Beaker 3: Today (e.g. 2024) */}
              <GlassBeaker
                year={data.endYear}
                label="Today"
                co2Ppm={todayCo2}
                emissionsIndex={`${formatMt(latestCo2)} Mt (${(latestCo2 / parentsBirthCo2).toFixed(1)}×)`}
                bgColorId="bg-2024"
                co2Particles={todayParticles.co2}
                sootParticles={todayParticles.soot}
              />
            </div>

            {/* Particle legend */}
            <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[10px] text-muted-foreground select-none">
              <span className="flex items-center gap-1.5">
                <span className="block size-2 rounded-full bg-[#f5d547]" />
                <span>Global CO₂ molecules (ppm density)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="block size-1.5 rounded-full bg-foreground" />
                <span>National soot particulates (relative emissions)</span>
              </span>
            </div>
          </div>

          {/* RIGHT COLUMN: Air Purity Narrative Card */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Wind className="size-4 text-primary" />
                <span>First Breath Air Quality</span>
              </h4>

              <div className="text-xs text-muted-foreground space-y-3.5 leading-relaxed text-pretty">
                <p>
                  At the moment of your birth in <strong>{birthYear}</strong>, the first breath you drew in was already{' '}
                  <strong>{((yourCo2 - parentsCo2) / parentsCo2 * 100).toFixed(0)}% more carbon-concentrated</strong> than your parents&apos; first breath in <strong>{parentsBirthYear}</strong> (<strong>{yourCo2} ppm</strong> vs <strong>{parentsCo2} ppm</strong>).
                </p>
                <p>
                  Furthermore, due to the rapid acceleration of industrial growth across these decades, India emitted{' '}
                  <strong>{(attendeeBirthCo2 / parentsBirthCo2).toFixed(1)}× more carbon particulates</strong> in your birth year than in theirs. This soot load was directly suspended in the local atmosphere.
                </p>
                <p>
                  For a child taking their first breath today (<strong>{data.endYear}</strong>), the atmospheric shift is even more stark:
                </p>
                <ul className="list-disc pl-4 space-y-1.5 text-foreground/80 font-medium">
                  <li>Global CO₂ concentration has reached <strong>{todayCo2} ppm</strong> (a <strong>{((todayCo2 - parentsCo2) / parentsCo2 * 100).toFixed(0)}%</strong> surge above the 1978 baseline).</li>
                  <li>India&apos;s annual carbon emissions are <strong>{(latestCo2 / parentsBirthCo2).toFixed(1)}× higher</strong> (<strong>{formatMt(latestCo2)} Mt</strong>) than when your parents were born.</li>
                </ul>
              </div>

              <div className="flex gap-2 items-start text-[10px] text-muted-foreground leading-normal bg-muted/10 p-2.5 rounded-lg border border-border/40 text-pretty select-none mt-1">
                <Info className="size-4 text-primary shrink-0 mt-0.5" />
                <span>
                  <strong>Interpretation:</strong> The beakers represent 1 Liter of air. Yellow dots show global greenhouse gas accumulation, while grey dots represent the multiplying density of particulate soot in the national air.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

type GlassBeakerProps = {
  year: number
  label: string
  co2Ppm: number
  emissionsIndex: string
  bgColorId: string
  co2Particles: Particle[]
  sootParticles: Particle[]
}

function GlassBeaker({
  year,
  label,
  co2Ppm,
  emissionsIndex,
  bgColorId,
  co2Particles,
  sootParticles,
}: GlassBeakerProps) {
  const bWidth = 90
  const bHeight = 190

  return (
    <div className="flex flex-col items-center w-full space-y-2 select-none">
      <div className="text-center">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <h5 className="font-heading text-base font-bold text-foreground mt-0.5 leading-none">{year}</h5>
      </div>

      <div className="relative w-full max-w-[85px] aspect-[85/185]">
        <svg
          viewBox={`0 0 110 210`}
          className="w-full h-auto overflow-visible"
        >
          <defs>
            <style>
              {`
                @keyframes float-particle {
                  0% { transform: translate(0px, 0px); }
                  50% { transform: translate(var(--x-wig), var(--y-wig)); }
                  100% { transform: translate(0px, 0px); }
                }
                .float-p {
                  animation: float-particle var(--dur) ease-in-out infinite;
                  animation-delay: var(--del);
                }
              `}
            </style>
            
            {bgColorId === 'bg-1978' && (
              <linearGradient id="bg-1978" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f5d547" stopOpacity={0.03} />
                <stop offset="100%" stopColor="#6b8eb8" stopOpacity={0.08} />
              </linearGradient>
            )}
            {bgColorId === 'bg-2003' && (
              <linearGradient id="bg-2003" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d45a3a" stopOpacity={0.06} />
                <stop offset="100%" stopColor="#f0a040" stopOpacity={0.12} />
              </linearGradient>
            )}
            {bgColorId === 'bg-2024' && (
              <linearGradient id="bg-2024" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d45a3a" stopOpacity={0.15} />
                <stop offset="50%" stopColor="#3d2c38" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#1a1028" stopOpacity={0.5} />
              </linearGradient>
            )}
          </defs>

          {/* Liquid/Atmospheric Fog fill inside beaker */}
          <rect
            x={10}
            y={15}
            width={bWidth}
            height={bHeight}
            rx={14}
            fill={`url(#${bgColorId})`}
            pointerEvents="none"
          />

          {/* Glass Beaker Container Outline */}
          <rect
            x={10}
            y={15}
            width={bWidth}
            height={bHeight}
            rx={14}
            fill="none"
            stroke="var(--color-foreground)"
            strokeWidth={1.5}
            strokeOpacity={0.15}
            pointerEvents="none"
          />

          {/* Measurement Ticks on Beaker */}
          {[45, 75, 105, 135, 165].map((ty) => (
            <line
              key={ty}
              x1={86}
              y1={ty}
              x2={92}
              y2={ty}
              stroke="var(--color-foreground)"
              strokeOpacity={0.2}
              strokeWidth={1}
              pointerEvents="none"
            />
          ))}

          {/* CO2 Particles (Golden amber dots) */}
          {co2Particles.map((p) => (
            <circle
              key={p.id}
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill="#f5d547"
              className="float-p"
              style={{
                '--x-wig': `${p.xWiggle}px`,
                '--y-wig': `${p.yWiggle}px`,
                '--dur': `${p.duration}s`,
                '--del': `${p.delay}s`,
              } as React.CSSProperties}
              opacity={0.85}
            />
          ))}

          {/* Soot Particles (Dark charcoal specks) */}
          {sootParticles.map((p) => (
            <circle
              key={p.id}
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill="currentColor"
              className="float-p text-foreground"
              style={{
                '--x-wig': `${p.xWiggle}px`,
                '--y-wig': `${p.yWiggle}px`,
                '--dur': `${p.duration}s`,
                '--del': `${p.delay}s`,
              } as React.CSSProperties}
              opacity={0.7}
            />
          ))}

          {/* Glossy glass sheen reflection strip */}
          <path
            d={`M 14 20 L 20 20 L 20 200 L 14 200 Z`}
            fill="white"
            fillOpacity={0.06}
            pointerEvents="none"
          />
        </svg>
      </div>

      <div className="text-center space-y-0.5 select-none mt-1">
        <p className="text-xs font-bold text-foreground tabular-nums">{co2Ppm} ppm</p>
        <p className="text-[9px] text-muted-foreground font-medium tabular-nums tracking-tight leading-tight">{emissionsIndex}</p>
      </div>
    </div>
  )
}

function buildRingGeometry(
  years: { year: number; co2Mt: number }[],
  colorMin: number,
  colorMax: number,
  wigglePerm: number[],
  birthYear: number,
): RingGeometry[] {
  if (years.length === 0) {
    return []
  }

  const colorSpan = colorMax - colorMin
  const availableSpan = MAX_RADIUS - MIN_RADIUS

  // Reserve a minimum width for every ring to keep them hoverable and visible
  const minWidth = Math.max(1.2, Math.min(2.5, 70 / years.length))
  const totalReserved = minWidth * years.length
  const variableSpan = Math.max(20, availableSpan - totalReserved)

  const weights = years.map((point) => Math.pow(point.co2Mt, WIDTH_EXPONENT))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

  let radius = MIN_RADIUS
  const rings: RingGeometry[] = []

  for (let index = 0; index < years.length; index += 1) {
    const point = years[index]!
    const width = minWidth + (totalWeight > 0 ? (weights[index]! / totalWeight) * variableSpan : variableSpan / years.length)
    const inner = radius
    const outer = inner + width
    const norm = colorSpan > 0 ? (point.co2Mt - colorMin) / colorSpan : 0.5

    rings.push({
      year: point.year,
      co2Mt: point.co2Mt,
      innerR: inner,
      outerR: outer,
      d: parallelAnnulusPath(CENTER, CENTER, inner, outer, wigglePerm),
      color: emissionColor(norm),
      isShared: point.year >= birthYear,
    })

    radius = outer
  }

  return rings
}

function wiggledCirclePath(cx: number, cy: number, r: number, perm: number[]): string {
  const N_POINTS = 160
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= N_POINTS; i += 1) {
    const angle = (i / N_POINTS) * Math.PI * 2
    const w = sharedWiggleOffset(angle, perm)
    pts.push({
      x: cx + (r + w) * Math.cos(angle),
      y: cy + (r + w) * Math.sin(angle),
    })
  }
  let d = `M ${pts[0]!.x} ${pts[0]!.y} `
  for (let i = 1; i < pts.length; i += 1) {
    d += `L ${pts[i]!.x} ${pts[i]!.y} `
  }
  d += 'Z'
  return d
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

function hashLabel(label: string): number {
  let hash = 0
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  }
  return hash
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
