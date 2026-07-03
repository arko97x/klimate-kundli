import { useMemo, useRef, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import matchstickImg from '@/assets/matchstick.png'

import type { IndiaEmissionsRings, GlobalContext } from '@/lib/api'
import { EMISSIONS_CATEGORIES, EMISSIONS_SIZE, buildEmissionsPlume } from '@/lib/emissions-plume'

const SIZE = EMISSIONS_SIZE
const CATEGORIES = EMISSIONS_CATEGORIES

type EmissionsRingsChartProps = {
  birthYear: number
  data: IndiaEmissionsRings
  parentsData?: IndiaEmissionsRings | null
  globalContext?: GlobalContext | null
}

export function EmissionsRingsChart({ birthYear, data }: EmissionsRingsChartProps) {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null)
  const [hoveredCategoryKey, setHoveredCategoryKey] = useState<string | null>(null)
  const [hoveredCategoryLabel, setHoveredCategoryLabel] = useState<string | null>(null)
  const [hoveredValue, setHoveredValue] = useState<number | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  // Streamgraph geometry (coords for hover detection + smooth ribbon paths).
  const { coords, paths } = useMemo(() => buildEmissionsPlume(data), [data])

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

  const latestRatioToAttendeeBirth = attendeeBirthCo2 > 0 ? latestCo2 / attendeeBirthCo2 : 0

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

    list.push({
      label: 'Today',
      year: data.endYear,
      co2: latestCo2,
      growthText: `${latestRatioToAttendeeBirth.toFixed(1)}× since birth`,
    })

    return list
  }, [birthYear, data, attendeeBirthCo2, latestCo2, latestRatioToAttendeeBirth])

  return (
    <section className="space-y-6 pb-6">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Carbon legacy</p>
        <h3 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl text-pretty">
          India&apos;s carbon emissions across your lifetime
        </h3>
        <p className="max-w-3xl text-pretty text-sm text-muted-foreground leading-relaxed select-none">
          National CO₂ emissions from {data.startYear} to {data.endYear} by fuel and industry source. 
          In your birth year ({birthYear}), India emitted {formatMt(data.firstCo2Mt)} Mt of CO₂, which has since grown 
          to {formatMt(data.lastCo2Mt)} Mt today ({data.growthFactor}× higher).
        </p>
      </div>

      <div className="mt-6 space-y-6">
        {/* Chart + milestone timeline, side by side */}
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {/* Diamond Matchstick Visualization */}
          <div className="flex flex-col items-center select-none">
          <div className="relative w-full max-w-sm aspect-square flex items-center justify-center">
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

          {/* Interactive Story Timeline — 2×2 grid beside the chart */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="size-3.5 text-primary" />
              <span>Interactive Story Timeline</span>
            </h4>

            {/* Clickable Milestones Grid */}
            <div className="grid grid-cols-2 gap-2.5">
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
                  className={`w-full text-left p-2.5 rounded-lg border transition-all duration-200 cursor-pointer ${
                    activeYear === m.year
                      ? 'border-primary bg-primary/5 shadow-xs'
                      : 'border-border/80 bg-muted/15 hover:bg-muted/30 hover:border-muted-foreground/30'
                  }`}
                >
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                    {m.label}
                  </p>
                  <div className="mt-0.5 flex items-baseline justify-between gap-1.5">
                    <h5 className="font-heading text-xl font-bold text-foreground leading-none">
                      {m.year}
                    </h5>
                    <span className="text-xs font-semibold tabular-nums text-foreground">
                      {formatMt(m.co2)} Mt
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] text-muted-foreground/90 font-medium tabular-nums truncate">
                    {m.growthText}
                  </p>
                </button>
              ))}
            </div>

            {/* Snapshot — compact, under the milestones */}
            <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3.5">
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
                    India&apos;s CO₂ Total
                  </p>
                  <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">
                    {formatMt(activeCo2)} <span className="text-xs font-normal text-muted-foreground">Mt</span>
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Your Age
                  </p>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {getYourAgeLabel(activeYear)}
                  </p>
                </div>
              </div>

              {/* Emissions source breakdown */}
              <div className="border-t border-border/60 pt-3 space-y-1">
                <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Emissions Source Breakdown ({activeYear})
                </p>
                <div className="divide-y divide-border/60">
                  {CATEGORIES.map((cat) => {
                    const val = activeYearData && activeYearData[cat.key] !== undefined ? (activeYearData[cat.key] as number) : 0
                    const pct = activeCo2 > 0 ? (val / activeCo2) * 100 : 0
                    const isCatHovered = hoveredCategoryKey === cat.key

                    return (
                      <div
                        key={cat.key}
                        className={`flex items-center justify-between gap-3 py-1 cursor-pointer transition-colors duration-150 ${
                          isCatHovered ? 'bg-primary/5' : ''
                        }`}
                        onPointerOver={() => setHoveredCategoryKey(cat.key)}
                        onPointerLeave={() => setHoveredCategoryKey(null)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-xs font-medium text-foreground">{cat.label}</span>
                        </div>
                        <div className="flex items-baseline gap-3">
                          <span className="text-xs font-bold text-foreground tabular-nums">
                            {formatMt(val)} <span className="text-[9px] font-normal text-muted-foreground">Mt</span>
                          </span>
                          <span className="w-9 text-right text-[10px] font-semibold text-muted-foreground tabular-nums">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
    </section>
  )
}

function formatMt(value: number | undefined | null): string {
  if (value == null || Number.isNaN(value)) return '0'
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}
