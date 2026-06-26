import type { City, KundliInput, LivedCity } from '@/types'

/** Tunnel root only — no trailing slash, no `/geocode` suffix. */
const API_BASE = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

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

export type PeakSource = 'imd_station' | 'era5_grid'

export interface HottestYearBlade {
  year: number
  cityName: string
  displayName: string
  /** Highest daily maximum (tmax) that year at this city's grid. */
  peakTempC: number
  /** Date (YYYY-MM-DD) when peakTempC occurred. */
  peakDate: string
  rankInCity: number
  peakSource: PeakSource
  isIndiaHome: boolean
  imdStationName?: string
  imdDistanceKm?: number
}

export interface HottestYearsInsight {
  count: number
  topK: number
  recordStartYear: number
  latestCompleteYear: number
  years: number[]
  byCity: HottestYearsByCity[]
  blades: HottestYearBlade[]
}

export interface IndiaEmissionsYear {
  year: number
  co2Mt: number
  coalMt: number
  oilMt: number
  cementMt: number
  gasMt: number
  flaringMt: number
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

export interface ArcticIceComparison {
  unit: 'country'
  name: string
  code: string
  areaKm2: number
  multiple: number
}

export interface ArcticIce {
  birthWindow: { startYear: number; endYear: number; extentMkm2: number }
  recentWindow: { startYear: number; endYear: number; extentMkm2: number }
  /** Summer (September minimum) sea ice lost since birth, in km^2. Signed; negative = no net loss. */
  lostKm2: number
  lostMkm2: number
  /** null when no net loss or the birth country's area is unknown. */
  comparison: ArcticIceComparison | null
}

export interface GlobalContext {
  seaLevelRiseMm: number | null
  co2PpmAtBirth: number | null
  co2PpmNow: number | null
  /** Absent on kundlis saved before this feature shipped. */
  arcticIce?: ArcticIce | null
}

export interface RainRingYear {
  year: number
  precipMm: number
}

export interface RainRingsCity {
  cityName: string
  displayName: string
  startYear: number
  endYear: number
  years: RainRingYear[]
  wettestYear: number | null
  driestYear: number | null
  wetYearsAboveMedian: number
}

export interface RainRingsInsight {
  birthYear: number
  latestCompleteYear: number
  byCity: RainRingsCity[]
}

export interface TempTimelineYear {
  year: number
  meanTempC: number
  cityName: string
  displayName: string
  peakTempC?: number
  peakDate?: string
}

export interface TempTimelineCity {
  cityName: string
  displayName: string
}

export interface TempTimelineInsight {
  birthYear: number
  latestCompleteYear: number
  years: TempTimelineYear[]
  cities: TempTimelineCity[]
  warmestYear: number | null
  coolestYear: number | null
  lifeDeltaC: number | null
}

export interface RainfallInsight {
  heavyRainThresholdMm: number
  thenDaysPerYear: number
  nowDaysPerYear: number
  deltaDaysPerYear: number
  birthWindow: MonthlyDeltaWindow
  recentWindow: MonthlyDeltaWindow
  largestDelta: { month: number; delta: number } | null
  monsoonPctChange: number | null
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
  rainfall: RainfallInsight | null
  rainRings: RainRingsInsight | null
  tempTimeline: TempTimelineInsight | null
  source: string
  confidence: string
}

export interface KundliSnapshotChunk {
  index: number
  url: string
  width: number
  height: number
}

export interface KundliSnapshot {
  version: number
  createdAt: string
  viewportWidth: number
  deviceScaleFactor: number
  chunks: KundliSnapshotChunk[]
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

export interface SavedKundliSummary {
  slug: string
  birthCityDisplay: string
  birthYear: number
  createdAt: string
}

export interface SavedKundliRecord extends SavedKundliSummary {
  birthCity: City
  livedCities: LivedCity[]
  result: MonthlyDeltaResponse
  snapshot: KundliSnapshot | null
}

export interface SaveKundliInput {
  birthCity: City
  birthYear: number
  livedCities: LivedCity[]
  result: MonthlyDeltaResponse
}

export async function saveKundli(input: SaveKundliInput): Promise<SavedKundliSummary> {
  const res = await fetch(`${API_BASE}/kundlis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw new Error(`Could not save kundli (${res.status})`)
  }

  return res.json() as Promise<SavedKundliSummary>
}

export async function fetchKundliBySlug(slug: string): Promise<SavedKundliRecord> {
  const res = await fetch(`${API_BASE}/kundlis/${encodeURIComponent(slug)}`)

  if (res.status === 404) {
    throw new Error('Kundli not found')
  }

  if (!res.ok) {
    throw new Error(`Could not load kundli (${res.status})`)
  }

  return res.json() as Promise<SavedKundliRecord>
}

export async function fetchKundliList(
  limit = 50,
  offset = 0,
): Promise<SavedKundliSummary[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  const res = await fetch(`${API_BASE}/kundlis?${params}`)

  if (!res.ok) {
    throw new Error(`Could not load kundli list (${res.status})`)
  }

  const body = (await res.json()) as { items: SavedKundliSummary[] }
  return body.items ?? []
}
