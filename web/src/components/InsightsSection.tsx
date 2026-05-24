import type { MonthlyDeltaResponse } from '@/lib/api'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null)
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function hotMonth(monthly: (number | null)[]): { name: string; value: number } | null {
  let best: { index: number; value: number } | null = null
  for (let i = 0; i < monthly.length; i++) {
    const v = monthly[i]
    if (v == null) continue
    if (best == null || v > best.value) best = { index: i, value: v }
  }
  return best ? { name: MONTH_NAMES[best.index]!, value: best.value } : null
}

type InsightsSectionProps = {
  data: MonthlyDeltaResponse
}

export function InsightsSection({ data }: InsightsSectionProps) {
  const { parentsBirthWindow, globalContext, birthWindow, recentWindow, birthYear, city } = data

  const parentsMeanTemp = parentsBirthWindow ? avg(parentsBirthWindow.monthly) : null
  const birthMeanTemp = avg(birthWindow.monthly)
  const recentMeanTemp = avg(recentWindow.monthly)

  const parentsHotMonth = parentsBirthWindow ? hotMonth(parentsBirthWindow.monthly) : null
  const birthHotMonth = hotMonth(birthWindow.monthly)
  const recentHotMonth = hotMonth(recentWindow.monthly)

  const generationalDelta =
    parentsMeanTemp != null && recentMeanTemp != null
      ? recentMeanTemp - parentsMeanTemp
      : null

  const co2Rise =
    globalContext?.co2PpmAtBirth != null && globalContext?.co2PpmNow != null
      ? Math.round((globalContext.co2PpmNow - globalContext.co2PpmAtBirth) * 10) / 10
      : null

  const hasInsights =
    generationalDelta != null ||
    globalContext?.seaLevelRiseMm != null ||
    co2Rise != null

  if (!hasInsights) return null

  return (
    <section className="space-y-6 pb-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">What the numbers mean</p>
        <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Your climate story, interpreted.
        </h2>
        <p className="max-w-2xl text-pretty text-muted-foreground">
          Numbers alone don't tell the story. Here's what changed across three generations in {city.name}.
        </p>
      </div>

      {/* Generational temperature ladder */}
      {parentsBirthWindow && parentsMeanTemp != null && birthMeanTemp != null && recentMeanTemp != null && (
        <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-4">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Three-generation temperature arc · {city.name}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <GenTempCard
              era="Your parents' childhood"
              years={`${parentsBirthWindow.startYear}–${parentsBirthWindow.endYear}`}
              meanTemp={parentsMeanTemp}
              hotMonth={parentsHotMonth}
              color="#8fb8d8"
              baseline
            />
            <GenTempCard
              era="Your childhood"
              years={`${birthWindow.startYear}–${birthWindow.endYear}`}
              meanTemp={birthMeanTemp}
              hotMonth={birthHotMonth}
              color="#6b8eb8"
              delta={birthMeanTemp - parentsMeanTemp}
            />
            <GenTempCard
              era="Today"
              years={`${recentWindow.startYear}–${recentWindow.endYear}`}
              meanTemp={recentMeanTemp}
              hotMonth={recentHotMonth}
              color="#d3674a"
              delta={recentMeanTemp - parentsMeanTemp}
              highlight
            />
          </div>
          {generationalDelta != null && (
            <p className="text-sm text-muted-foreground">
              Across {birthYear - (parentsBirthWindow.startYear + 2) + (recentWindow.endYear - birthYear)} years,{' '}
              {city.name} warmed by{' '}
              <span className="font-semibold text-[#d3674a]">
                {generationalDelta > 0 ? '+' : ''}{generationalDelta.toFixed(2)}°C
              </span>{' '}
              on average — from your parents' era to today.
            </p>
          )}
        </div>
      )}

      {/* CO₂ + sea level stat cards */}
      {(co2Rise != null || globalContext?.seaLevelRiseMm != null) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {co2Rise != null && globalContext?.co2PpmAtBirth != null && globalContext?.co2PpmNow != null && (
            <StatCard
              label="Atmospheric CO₂"
              sublabel={`Since ${birthYear}`}
              before={`${globalContext.co2PpmAtBirth} ppm`}
              after={`${globalContext.co2PpmNow} ppm`}
              delta={`+${co2Rise} ppm`}
              context="The last time CO₂ was this high, humans didn't exist."
              accentColor="#e9a560"
            />
          )}
          {globalContext?.seaLevelRiseMm != null && (
            <StatCard
              label="Sea level rise"
              sublabel={`Since ${birthYear}`}
              before="0 mm"
              after={`+${globalContext.seaLevelRiseMm} mm`}
              delta={`+${globalContext.seaLevelRiseMm} mm`}
              context={`${globalContext.seaLevelRiseMm > 80 ? 'Entire coastal cities are being rethought.' : 'Small numbers, compounding consequences.'}`}
              accentColor="#6b8eb8"
            />
          )}
        </div>
      )}
    </section>
  )
}

function GenTempCard({
  era,
  years,
  meanTemp,
  hotMonth,
  color,
  delta,
  baseline,
  highlight,
}: {
  era: string
  years: string
  meanTemp: number
  hotMonth: { name: string; value: number } | null
  color: string
  delta?: number
  baseline?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-3 sm:p-4 space-y-2 ${
        highlight ? 'border-[#d3674a]/40 bg-[#d3674a]/5' : 'border-border bg-background/50'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">
            {era}
          </p>
          <p className="text-[10px] text-muted-foreground/70 tabular-nums">{years}</p>
        </div>
        {!baseline && delta != null && (
          <span
            className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: `${color}20`,
              color,
            }}
          >
            {delta > 0 ? '+' : ''}{delta.toFixed(2)}°
          </span>
        )}
      </div>
      <div>
        <p
          className="text-2xl font-semibold tabular-nums leading-none"
          style={{ color }}
        >
          {meanTemp.toFixed(1)}°C
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">annual mean</p>
      </div>
      {hotMonth && (
        <p className="text-[10px] text-muted-foreground">
          Hottest: {hotMonth.name.slice(0, 3)} · {hotMonth.value.toFixed(1)}°
        </p>
      )}
    </div>
  )
}

function StatCard({
  label,
  sublabel,
  before,
  after,
  delta,
  context,
  accentColor,
}: {
  label: string
  sublabel: string
  before: string
  after: string
  delta: string
  context: string
  accentColor: string
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground/70">{sublabel}</p>
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground">Then</p>
          <p className="text-sm font-medium tabular-nums text-muted-foreground">{before}</p>
        </div>
        <div className="text-muted-foreground/40 text-lg mb-0.5">→</div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground">Now</p>
          <p
            className="text-2xl font-bold tabular-nums leading-none"
            style={{ color: accentColor }}
          >
            {after}
          </p>
        </div>
      </div>
      <div
        className="inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
        style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
      >
        {delta}
      </div>
      <p className="text-xs text-muted-foreground italic">{context}</p>
    </div>
  )
}
