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

interface Remedy {
  upay: number
  title: string
  problem: string
  remedy: string
  confidence: string
}

function buildRemedies(data: MonthlyDeltaResponse): Remedy[] {
  const remedies: Remedy[] = []
  const { largestDelta, hottestYears, indiaEmissions, parentsBirthWindow, recentWindow } = data

  // Remedy 1: Temperature — drink chai cooler
  if (largestDelta && largestDelta.delta >= 0.2) {
    const { month, delta } = largestDelta
    const monthLabel = MONTH_NAMES[month] ?? 'Unknown'
    const chaiTempReduction = Math.max(2, Math.round(delta * 5))
    const normalChaiTemp = 70
    const prescribedTemp = normalChaiTemp - chaiTempReduction
    remedies.push({
      upay: 1,
      title: 'Overheating',
      problem: `${monthLabel} is now ${delta.toFixed(1)}°C hotter than when you were born.`,
      remedy: `Drink your chai at ${prescribedTemp}°C — exactly ${chaiTempReduction}°C cooler than a proper cup. Every day. For life. It will taste wrong. That is the point. A ${delta.toFixed(1)}°C warmer world earns a ${chaiTempReduction}°C cooler cup. A thermometer will be required. Guessing is not permitted.`,
      confidence: '96.4%',
    })
  }

  // Remedy 2: CO₂ — stop using AI
  if (indiaEmissions && indiaEmissions.years.length > 0) {
    const totalMt = indiaEmissions.years.reduce((s, y) => s + y.co2Mt, 0)
    const perCapitaTonnes = Math.round(totalMt / 1400)
    // 1 AI query ≈ 7g CO₂ = 0.000007 tonnes
    const aiQueries = Math.round(perCapitaTonnes / 0.000007)
    // Assuming 10 queries/day = 3,650/year
    const yearsOffAI = Math.round(aiQueries / 3650)
    const queriesReadable =
      aiQueries >= 1_000_000_000
        ? `${(aiQueries / 1_000_000_000).toFixed(1)}B`
        : aiQueries >= 1_000_000
          ? `${(aiQueries / 1_000_000).toFixed(1)}M`
          : aiQueries.toLocaleString()

    remedies.push({
      upay: 2,
      title: 'Carbon Debt',
      problem: `Your per-capita share of India's CO₂ since you were born: ~${perCapitaTonnes} tonnes.`,
      remedy: `To offset this, you would need to forgo ${queriesReadable} AI queries — or stop using AI entirely for ${yearsOffAI.toLocaleString()} years. This prescription is self-aware. We recommend beginning immediately. The irony has already been noted.`,
      confidence: '∞%',
    })
  }

  // Remedy 3: Sea level — drink less water
  if (data.globalContext?.seaLevelRiseMm != null && data.globalContext.seaLevelRiseMm > 0) {
    const mm = Math.round(data.globalContext.seaLevelRiseMm)
    const glassesLess = Math.max(1, Math.round(mm / 10))
    const glacierIdols = Math.max(1, Math.round(mm / 80))
    remedies.push({
      upay: 3,
      title: 'Rising Seas',
      problem: `Sea levels rose ${mm}mm since you were born.`,
      remedy: `Drink ${glassesLess} fewer glass${glassesLess !== 1 ? 'es' : ''} of water per week. It will not help, but the gesture is symbolically significant. Additionally, place ${glacierIdols} ice cube${glacierIdols !== 1 ? 's' : ''} in the ocean annually. Do this at dawn. Do not explain yourself to bystanders.`,
      confidence: '108%',
    })
  }

  // Remedy 4: Hottest years — adopt trees
  if (hottestYears && hottestYears.count > 0) {
    const n = hottestYears.count
    const trees = Math.ceil(n / 3)
    const adoptionBudget = trees * 4200
    remedies.push({
      upay: 4,
      title: 'Record Heat',
      problem: `You have survived ${n} of the hottest years on record since ${hottestYears.recordStartYear}.`,
      remedy: `Adopt ${trees} tree${trees !== 1 ? 's' : ''} and take full responsibility for ${trees !== 1 ? 'them' : 'it'}. Budget approximately ₹${adoptionBudget.toLocaleString()} for the paperwork. The trees cannot object. They also cannot water themselves. This is now your responsibility.`,
      confidence: 'Ask your elders',
    })
  }

  // Remedy 5: Generational debt — fan your parents
  if (parentsBirthWindow) {
    const parentsMean = avg(parentsBirthWindow.monthly)
    const recentMean = avg(recentWindow.monthly)
    if (parentsMean != null && recentMean != null) {
      const genDelta = recentMean - parentsMean
      if (genDelta > 0.3) {
        const fanMinutes = Math.max(15, Math.round(genDelta * 40))
        remedies.push({
          upay: 5,
          title: 'Generational Debt',
          problem: `Temperatures rose ${genDelta.toFixed(1)}°C from your parents' childhood to today.`,
          remedy: `Fan your parents for ${fanMinutes} minutes daily as generational reparation. Hand-held palm-leaf fan only — electricity would defeat the purpose. Your parents may protest. This is between you and the thermometer now.`,
          confidence: 'Generationally certified',
        })
      }
    }
  }

  return remedies
}

type RemediesSectionProps = {
  data: MonthlyDeltaResponse
}

export function RemediesSection({ data }: RemediesSectionProps) {
  const remedies = buildRemedies(data)

  if (remedies.length === 0) return null

  return (
    <section className="space-y-6 pb-8">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">As prescribed by your climate astrologer</p>
        <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Your{' '}
          <span
            className="italic"
            style={{ color: '#c4832a' }}
          >
            upaay
          </span>
          .
        </h2>
        <p className="max-w-2xl text-pretty text-muted-foreground">
          Every kundli comes with remedies. These have been computed from your personal climate data and issued with total, unearned confidence.
        </p>
      </div>

      <div className="space-y-4">
        {remedies.map((remedy) => (
          <RemedyCard key={remedy.upay} remedy={remedy} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground/60 italic">
        * These remedies are satirical and scientifically non-binding. Your actual carbon footprint requires less theatrical and more structural intervention.
      </p>
    </section>
  )
}

function RemedyCard({ remedy }: { remedy: Remedy }) {
  return (
    <div className="rounded-xl border border-amber-200/40 bg-amber-50/20 dark:border-amber-900/30 dark:bg-amber-950/10 p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
            style={{
              backgroundColor: '#c4832a22',
              color: '#c4832a',
              border: '1px solid #c4832a44',
            }}
          >
            {remedy.upay}
          </span>
          <span className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider">
            {remedy.title}
          </span>
        </div>
        <span
          className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full border"
          style={{
            borderColor: '#c4832a33',
            color: '#c4832a',
            backgroundColor: '#c4832a0d',
          }}
        >
          {remedy.confidence} guaranteed
        </span>
      </div>

      <div className="space-y-2 pl-10">
        <p className="text-xs text-muted-foreground italic leading-relaxed">
          The problem: {remedy.problem}
        </p>
        <p className="text-sm leading-relaxed text-foreground">
          {remedy.remedy}
        </p>
      </div>
    </div>
  )
}
