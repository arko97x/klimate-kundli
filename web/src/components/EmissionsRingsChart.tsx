import { useMemo, useRef, useState } from 'react'
import { Calendar, Info, TrendingUp, Flame } from 'lucide-react'
import matchstickImg from '@/assets/matchstick.png'

import type { IndiaEmissionsRings, GlobalContext } from '@/lib/api'

const SIZE = 400

function getForwardCurveSegments(points: { x: number; y: number }[]): string {
  const N = points.length
  if (N < 2) return ''
  let d = ''
  const tension = 0.25
  for (let i = 0; i < N - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[Math.min(N - 1, i + 2)]!

    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = p1.y + (p2.y - p0.y) * tension
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = p2.y - (p3.y - p1.y) * tension

    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`
  }
  return d
}

function getBackwardCurveSegments(points: { x: number; y: number }[]): string {
  const pointsRev = [...points].reverse()
  return getForwardCurveSegments(pointsRev)
}


type EmissionsRingsChartProps = {
  birthYear: number
  data: IndiaEmissionsRings
  parentsData?: IndiaEmissionsRings | null
  globalContext?: GlobalContext | null
}

const CATEGORIES = [
  { key: 'coalMt', label: 'Coal', color: '#5c0606' },
  { key: 'oilMt', label: 'Oil', color: '#cc1111' },
  { key: 'cementMt', label: 'Cement', color: '#e65100' },
  { key: 'gasMt', label: 'Gas', color: '#ff9800' },
  { key: 'flaringMt', label: 'Flaring', color: '#ffe082' },
] as const

export function EmissionsRingsChart({ birthYear, data, globalContext }: EmissionsRingsChartProps) {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null)
  const [hoveredCategoryKey, setHoveredCategoryKey] = useState<string | null>(null)
  const [hoveredCategoryLabel, setHoveredCategoryLabel] = useState<string | null>(null)
  const [hoveredValue, setHoveredValue] = useState<number | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  // 1. Process data coordinates
  const coords = useMemo(() => {
    const N = data.years.length
    if (N === 0) return []

    // Smoke starts at y=310 (match head) and ends at y=12 (top vertex of the diamond)
    const y_start = 310
    const y_end = 12
    const maxTotal = Math.max(...data.years.map((y) => (y.coalMt ?? 0) + (y.oilMt ?? 0) + (y.cementMt ?? 0) + (y.gasMt ?? 0) + (y.flaringMt ?? 0)))
    // Max width is 130px (half-width 65px) so it stays beautifully inside the diamond
    const baseScale = 130 / (maxTotal || 1)

    return data.years.map((pt, i) => {
      const y = N > 1 ? y_start - (i / (N - 1)) * (y_start - y_end) : y_start
      
      // Perfectly centered along the vertical axis of the diamond for symmetry
      const cx = 200

      // Pinch the smoke narrow at the match tip
      const taper = Math.min(1.0, (y_start - y) / 25)
      const scale = baseScale * Math.max(0.08, taper)

      const w_coal = (pt.coalMt ?? 0) * scale
      const w_oil = (pt.oilMt ?? 0) * scale
      const w_cement = (pt.cementMt ?? 0) * scale
      const w_gas = (pt.gasMt ?? 0) * scale
      const w_flaring = (pt.flaringMt ?? 0) * scale
      const W = w_coal + w_oil + w_cement + w_gas + w_flaring

      // Cumulative stacking positions
      const x0 = cx - W / 2
      const x1 = x0 + w_coal
      const x2 = x1 + w_oil
      const x3 = x2 + w_cement
      const x4 = x3 + w_gas
      const x5 = x4 + w_flaring

      return {
        year: pt.year,
        y,
        x: [x0, x1, x2, x3, x4, x5],
        values: {
          coalMt: pt.coalMt ?? 0,
          oilMt: pt.oilMt ?? 0,
          cementMt: pt.cementMt ?? 0,
          gasMt: pt.gasMt ?? 0,
          flaringMt: pt.flaringMt ?? 0,
        },
        co2Mt: pt.co2Mt,
      }
    })
  }, [data])

  // 2. Build the continuous smooth SVG paths for each category ribbon
  const paths = useMemo(() => {
    return CATEGORIES.map((cat, j) => {
      const leftPoints = coords.map((c) => ({ x: c.x[j]!, y: c.y }))
      const rightPoints = coords.map((c) => ({ x: c.x[j + 1]!, y: c.y }))

      if (leftPoints.length === 0) {
        return {
          key: cat.key,
          label: cat.label,
          color: cat.color,
          d: '',
        }
      }

      const p0 = leftPoints[0]!
      const forward = getForwardCurveSegments(leftPoints)
      const pTop = rightPoints[rightPoints.length - 1]!
      const backward = getBackwardCurveSegments(rightPoints)

      // Start at bottom-left, curve up, line to top-right, curve down, close to bottom-left
      const d = `M ${p0.x.toFixed(2)},${p0.y.toFixed(2)} ${forward} L ${pTop.x.toFixed(2)},${pTop.y.toFixed(2)} ${backward} Z`

      return {
        key: cat.key,
        label: cat.label,
        color: cat.color,
        d,
      }
    })
  }, [coords])

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    // Convert client coordinates to SVG local coordinates (viewBox is 0 0 400 400)
    const localX = ((e.clientX - rect.left) / rect.width) * SIZE
    const localY = ((e.clientY - rect.top) / rect.height) * SIZE

    if (coords.length === 0) return

    // Find the closest year based on localY
    let closestCoord = coords[0]!
    let minDiff = Math.abs(coords[0]!.y - localY)

    for (let i = 1; i < coords.length; i++) {
      const diff = Math.abs(coords[i]!.y - localY)
      if (diff < minDiff) {
        minDiff = diff
        closestCoord = coords[i]!
      }
    }

    // Only activate hover if we are within the vertical limits of the streamgraph (with some padding)
    if (localY < 8 || localY > 325) {
      setHoveredYear(null)
      setHoveredCategoryKey(null)
      setHoveredCategoryLabel(null)
      setHoveredValue(null)
      return
    }

    setHoveredYear(closestCoord.year)
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })

    // Find the category by checking localX against the cumulative x boundaries of closestCoord
    const { x: xBounds, values } = closestCoord
    let foundCat = false

    for (let j = 0; j < CATEGORIES.length; j++) {
      const xStart = xBounds[j]!
      const xEnd = xBounds[j + 1]!
      
      if (localX >= xStart && localX <= xEnd) {
        const cat = CATEGORIES[j]!
        setHoveredCategoryKey(cat.key)
        setHoveredCategoryLabel(cat.label)
        setHoveredValue(values[cat.key])
        foundCat = true
        break
      }
    }

    if (!foundCat) {
      setHoveredCategoryKey(null)
      setHoveredCategoryLabel(null)
      setHoveredValue(null)
    }
  }

  const handlePointerLeave = () => {
    setHoveredYear(null)
    setHoveredCategoryKey(null)
    setHoveredCategoryLabel(null)
    setHoveredValue(null)
  }

  const handleClick = () => {
    if (hoveredYear !== null) {
      setSelectedYear(hoveredYear)
    }
  }


  const activeYear = hoveredYear ?? selectedYear ?? data.endYear
  const activeCoord = coords.find((c) => c.year === activeYear)
  const activeCo2 = activeCoord?.co2Mt ?? 0
  const activeYearData = data.years.find((y) => y.year === activeYear)

  const activeYCoord = activeCoord?.y ?? 310
  const activeHalfWidth = activeYCoord < 200 ? activeYCoord - 12 : 388 - activeYCoord

  // Baseline values
  const attendeeBirthCo2 = coords.find((c) => c.year === birthYear)?.co2Mt ?? data.firstCo2Mt
  const latestCo2 = data.lastCo2Mt

  const ratioToAttendeeBirth = attendeeBirthCo2 > 0 ? activeCo2 / attendeeBirthCo2 : 0
  const latestRatioToAttendeeBirth = attendeeBirthCo2 > 0 ? latestCo2 / attendeeBirthCo2 : 0

  // CO₂ PPM lookup
  const yourCo2 = useMemo(() => globalContext?.co2PpmAtBirth ?? getCo2Ppm(birthYear), [globalContext, birthYear])
  const todayCo2 = useMemo(() => globalContext?.co2PpmNow ?? getCo2Ppm(data.endYear), [globalContext, data.endYear])

  function getYourAgeLabel(year: number) {
    if (year < birthYear) return 'Not yet born'
    if (year === birthYear) return 'Born'
    return `Age ${year - birthYear}`
  }

  // Generate visitor-centric milestones
  const milestones = useMemo(() => {
    const list = [
      {
        label: 'Your Birth Year',
        year: birthYear,
        co2: attendeeBirthCo2,
        growthText: 'Baseline',
      },
    ]

    const ageTenYear = birthYear + 10
    if (ageTenYear < data.endYear) {
      const co2 = coords.find((c) => c.year === ageTenYear)?.co2Mt ?? 0
      const ratio = attendeeBirthCo2 > 0 ? co2 / attendeeBirthCo2 : 0
      list.push({
        label: 'Age 10',
        year: ageTenYear,
        co2,
        growthText: ratio > 1 ? `${ratio.toFixed(1)}× since birth` : 'Baseline',
      })
    }

    const ageTwentyYear = birthYear + 20
    if (ageTwentyYear < data.endYear) {
      const co2 = coords.find((c) => c.year === ageTwentyYear)?.co2Mt ?? 0
      const ratio = attendeeBirthCo2 > 0 ? co2 / attendeeBirthCo2 : 0
      list.push({
        label: 'Age 20',
        year: ageTwentyYear,
        co2,
        growthText: ratio > 1 ? `${ratio.toFixed(1)}× since birth` : 'Baseline',
      })
    }

    list.push({
      label: 'Today',
      year: data.endYear,
      co2: latestCo2,
      growthText: `${latestRatioToAttendeeBirth.toFixed(1)}× since birth`,
    })

    return list
  }, [birthYear, data, coords, attendeeBirthCo2, latestCo2, latestRatioToAttendeeBirth])

  // Identify the largest category for the narrative text
  const largestCategory = useMemo(() => {
    if (!activeYearData) return null
    let maxVal = -1
    let maxCat: typeof CATEGORIES[number] = CATEGORIES[0]
    for (const cat of CATEGORIES) {
      const val = (activeYearData[cat.key] as number) ?? 0
      if (val > maxVal) {
        maxVal = val
        maxCat = cat
      }
    }
    return { ...maxCat, value: maxVal }
  }, [activeYearData])

  return (
    <section className="space-y-6 pb-6">
      <div className="space-y-3">
        <h3 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl text-pretty">
          India&apos;s carbon emissions across your lifetime
        </h3>
        <p className="max-w-3xl text-pretty text-sm text-muted-foreground leading-relaxed select-none">
          National CO₂ emissions from {data.startYear} to {data.endYear} by fuel and industry source. 
          In your birth year ({birthYear}), India emitted {formatMt(data.firstCo2Mt)} Mt of CO₂, which has since grown 
          to {formatMt(data.lastCo2Mt)} Mt today ({data.growthFactor}× higher).
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-12 items-start mt-6">
        {/* LEFT COLUMN: Diamond Matchstick Visualization */}
        <div className="lg:col-span-7 flex flex-col items-center select-none">
          <div className="relative w-full max-w-sm aspect-square bg-muted/5 rounded-2xl border border-border/60 p-4 shadow-sm flex items-center justify-center overflow-hidden">
            
            {/* Metaphor Overlay at Top Left */}
            <div className="absolute top-3 left-3 bg-background/85 backdrop-blur-xs px-2.5 py-1 rounded-md border border-border/80 text-[10px] text-muted-foreground flex items-center gap-1.5 z-10">
              <Flame className="size-3 text-amber-500 animate-pulse" />
              <span>Emissions Matchstick</span>
            </div>

            <svg
              ref={svgRef}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="h-auto w-full touch-none overflow-visible cursor-pointer"
              role="img"
              aria-label={`Carbon emissions streamgraph rising from a matchstick from birth year ${birthYear} to ${data.endYear}.`}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              onClick={handleClick}
            >
              <defs>
                <clipPath id="diamond-clip">
                  <polygon points="200,12 388,200 200,388 12,200" />
                </clipPath>
              </defs>

              {/* Clipped group containing background, matchstick, and streamgraph smoke */}
              <g clipPath="url(#diamond-clip)">
                {/* Diamond Background */}
                <polygon points="200,12 388,200 200,388 12,200" fill="var(--color-muted)" fillOpacity={0.2} />

                {/* Matchstick PNG Image at Bottom */}
                <image
                  href={matchstickImg}
                  x={162.5}
                  y={200}
                  width={75}
                  height={260}
                  pointerEvents="none"
                />

                {/* Streamgraph segments (rising smoke) */}
                <g pointerEvents="none">
                  {paths.map((path) => {
                    const isCatHovered = hoveredCategoryKey === path.key

                    let opacity = 0.85
                    if (hoveredCategoryKey !== null) {
                      opacity = isCatHovered ? 1.0 : 0.25
                    }

                    return (
                      <path
                        key={path.key}
                        d={path.d}
                        fill={path.color}
                        stroke={path.color}
                        strokeWidth={0.5} // prevents anti-aliasing seams
                        opacity={opacity}
                        className="transition-all duration-100 ease-out"
                      />
                    )
                  })}
                </g>
              </g>

              {/* Horizontal dotted active year guide line */}
              {hoveredYear !== null && (
                <g pointerEvents="none">
                  <line
                    x1={200 - activeHalfWidth}
                    y1={activeYCoord}
                    x2={200 + activeHalfWidth}
                    y2={activeYCoord}
                    stroke="var(--color-foreground)"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    opacity={0.6}
                  />
                  {/* Floating tick indicator on the border */}
                  <circle cx={200 - activeHalfWidth} cy={activeYCoord} r={2} fill="var(--color-foreground)" />
                  <circle cx={200 + activeHalfWidth} cy={activeYCoord} r={2} fill="var(--color-foreground)" />
                </g>
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
            {hoveredYear && hoveredCategoryLabel && (
              <div
                className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] shadow-sm tabular-nums text-popover-foreground transition-all duration-75 select-none"
                style={{ left: tooltipPos.x, top: tooltipPos.y - 12 }}
              >
                <div className="font-semibold flex items-center justify-between gap-4">
                  <span>{hoveredYear}</span>
                  <span className="text-[10px] text-muted-foreground">{getYourAgeLabel(hoveredYear)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: CATEGORIES.find((c) => c.key === hoveredCategoryKey)?.color }}
                  />
                  <span>{hoveredCategoryLabel}: <strong>{formatMt(hoveredValue ?? 0)} Mt</strong></span>
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  Total: {formatMt(coords.find((c) => c.year === hoveredYear)?.co2Mt ?? 0)} Mt
                </div>
              </div>
            )}
          </div>

          {/* Color scale / Categories legend */}
          <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 w-full max-w-sm px-2">
            {CATEGORIES.map((cat) => (
              <div
                key={cat.key}
                onPointerOver={() => setHoveredCategoryKey(cat.key)}
                onPointerLeave={() => setHoveredCategoryKey(null)}
                className={`flex items-center gap-1.5 text-[10px] select-none transition-all duration-150 cursor-pointer ${
                  hoveredCategoryKey === cat.key ? 'text-foreground font-semibold scale-105' : 'text-muted-foreground'
                }`}
              >
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                <span>{cat.label}</span>
              </div>
            ))}
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
                    activeYear === m.year
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

              {/* General snapshot details */}
              <div className="grid grid-cols-2 gap-4 border-t border-border/60 pt-3">
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
                    India&apos;s CO₂ Total
                  </p>
                  <p className="text-base font-bold text-foreground tabular-nums mt-0.5">
                    {formatMt(activeCo2)} <span className="text-xs font-normal text-muted-foreground">Mt</span>
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Your Age
                  </p>
                  <p className="text-base font-bold text-foreground mt-0.5">
                    {getYourAgeLabel(activeYear)}
                  </p>
                </div>
              </div>

              {/* 5-Category Detailed Grid */}
              <div className="border-t border-border/60 pt-3.5 space-y-2">
                <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Emissions Source Breakdown ({activeYear})
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => {
                    const val = activeYearData && activeYearData[cat.key] !== undefined ? (activeYearData[cat.key] as number) : 0
                    const pct = activeCo2 > 0 ? (val / activeCo2) * 100 : 0
                    const isCatHovered = hoveredCategoryKey === cat.key

                    return (
                      <div
                        key={cat.key}
                        className={`p-2 rounded-md border transition-all duration-150 flex flex-col justify-between cursor-pointer ${
                          isCatHovered
                            ? 'border-primary bg-primary/5 shadow-2xs'
                            : 'border-border/50 bg-muted/5 hover:bg-muted/15'
                        }`}
                        onPointerOver={() => setHoveredCategoryKey(cat.key)}
                        onPointerLeave={() => setHoveredCategoryKey(null)}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-[10px] font-medium text-foreground">{cat.label}</span>
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between">
                          <span className="text-xs font-bold text-foreground tabular-nums">
                            {formatMt(val)} <span className="text-[8px] font-normal text-muted-foreground">Mt</span>
                          </span>
                          <span className="text-[9px] text-muted-foreground tabular-nums font-semibold">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Dynamic narrative block */}
              <div className="border-t border-border/60 pt-3 text-xs text-muted-foreground leading-relaxed text-pretty">
                <span>
                  In <strong>{activeYear}</strong>, {activeYear === birthYear ? 'the year you were born' : `when you were ${getYourAgeLabel(activeYear).toLowerCase()}`}, global CO₂ was <strong>{getCo2Ppm(activeYear)} ppm</strong>. India emitted <strong>{formatMt(activeCo2)} Mt</strong> of CO₂.
                  {largestCategory && largestCategory.value > 0 && (
                    <>
                      {' '}<strong>{largestCategory.label}</strong> was the leading source, contributing{' '}
                      <strong>{formatMt(largestCategory.value)} Mt</strong> (
                      {((largestCategory.value / (activeCo2 || 1)) * 100).toFixed(0)}% of the total).
                    </>
                  )}
                  {activeYear > birthYear && (
                    <>
                      {' '}This is <strong>{ratioToAttendeeBirth.toFixed(1)}×</strong> the emissions level of your birth year ({formatMt(attendeeBirthCo2)} Mt, when global CO₂ was {yourCo2} ppm; today it is {todayCo2} ppm).
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="flex gap-2 items-start text-[10px] text-muted-foreground leading-normal bg-muted/10 p-2.5 rounded-lg border border-border/40 text-pretty select-none mt-1">
              <Info className="size-4 text-primary shrink-0 mt-0.5" />
              <span>
                <strong>Interpretation:</strong> The diamond shapes your timeline from birth (bottom matchstick head) to today (top vertex). The organic stacked plume represents CO₂ emissions contributions by source: Coal, Oil, Cement, Gas, and Flaring, which expand like smoke as emissions grow.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
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
  2025: 426,
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

function formatMt(value: number | undefined | null): string {
  if (value == null || Number.isNaN(value)) return '0'
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}
