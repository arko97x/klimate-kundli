import type { City, KundliInput, LivedCity } from '@/types'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export async function geocodeCities(query: string): Promise<City[]> {
  const q = query.trim()
  if (!q) {
    return []
  }

  const res = await fetch(`${API_BASE}/geocode?q=${encodeURIComponent(q)}`)
  if (!res.ok) {
    throw new Error('City search failed')
  }

  const body = (await res.json()) as { results: City[] }
  return body.results ?? []
}

export async function generateKundli(input: KundliInput): Promise<unknown> {
  const res = await fetch(`${API_BASE}/kundli`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { issues?: unknown } | null
    throw new Error(err ? 'Could not generate kundli' : `Request failed (${res.status})`)
  }

  return res.json()
}

export interface MonthlyDeltaWindow {
  startYear: number
  endYear: number
  monthly: (number | null)[]
  monthlyMin: (number | null)[]
  monthlyMax: (number | null)[]
}

export interface HottestYearsByCity {
  cityName: string
  displayName: string
  hotYearsLived: number
  yearsLived: number
  matchingYears: number[]
}

export interface HottestYearsInsight {
  count: number
  topK: number
  recordStartYear: number
  latestCompleteYear: number
  years: number[]
  byCity: HottestYearsByCity[]
}

export interface IndiaEmissionsYear {
  year: number
  co2Mt: number
}

export interface IndiaEmissionsRings {
  country: string
  startYear: number
  endYear: number
  years: IndiaEmissionsYear[]
  firstCo2Mt: number
  lastCo2Mt: number
  growthFactor: number | null
}

export interface GlobalContext {
  seaLevelRiseMm: number | null
  co2PpmAtBirth: number | null
  co2PpmNow: number | null
}

export interface MonthlyDeltaResponse {
  city: City
  birthYear: number
  birthWindow: MonthlyDeltaWindow
  recentWindow: MonthlyDeltaWindow
  largestDelta: { month: number; delta: number } | null
  hottestYears: HottestYearsInsight | null
  indiaEmissions: IndiaEmissionsRings | null
  parentsIndiaEmissions: IndiaEmissionsRings | null
  parentsBirthWindow: MonthlyDeltaWindow | null
  globalContext: GlobalContext | null
  source: string
  confidence: string
}

export async function fetchMonthlyDelta(
  birthCity: City,
  birthYear: number,
  livedCities: LivedCity[],
): Promise<MonthlyDeltaResponse> {
  const res = await fetch(`${API_BASE}/monthly-delta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ birthCity, birthYear, livedCities }),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { hint?: string; error?: string } | null
    if (body?.error === 'no_weather_data') {
      throw new Error(
        body.hint ?? 'Weather data is temporarily unavailable. Wait ~30 seconds and try again.',
      )
    }
    throw new Error(`Could not load chart data (${res.status})`)
  }

  return res.json() as Promise<MonthlyDeltaResponse>
}
