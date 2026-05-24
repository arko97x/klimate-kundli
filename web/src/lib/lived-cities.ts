import type { City, LivedCity, ResidenceRow } from '@/types'
import { latestCompleteYearUtc } from '@/lib/years'

export function stintStartDate(startYear: number): string {
  return `${startYear}-01-01`
}

export function stintEndDate(endYear: number): string {
  return `${endYear}-12-31`
}

export function rowsToLivedCities(
  rows: ResidenceRow[],
  latestComplete = latestCompleteYearUtc(),
): LivedCity[] {
  return rows.map((row, index) => {
    if (!row.city) {
      throw new Error(`Row ${index + 1} is missing a city`)
    }

    const startYear = row.range[0]
    const endYear = row.range[1]
    const isLast = index === rows.length - 1
    const isCurrent = isLast && endYear >= latestComplete

    return {
      ...row.city,
      start: stintStartDate(startYear),
      end: isCurrent ? null : stintEndDate(endYear),
    }
  })
}

export function updateRowRange(
  rows: ResidenceRow[],
  index: number,
  next: [number, number],
  birthYear: number,
  latestComplete = latestCompleteYearUtc(),
): ResidenceRow[] {
  const start = Math.max(birthYear, Math.min(next[0], latestComplete))
  const end = Math.max(start, Math.min(next[1], latestComplete))
  const normalized: [number, number] = [start, end]

  return rows.map((row, i) => (i === index ? { ...row, range: normalized } : row))
}

export function canAddResidenceRow(
  rows: ResidenceRow[],
  latestComplete = latestCompleteYearUtc(),
): boolean {
  const last = rows[rows.length - 1]
  return last ? last.range[1] < latestComplete : false
}

export function createInitialRows(
  birthCity: City,
  birthYear: number,
  latestComplete = latestCompleteYearUtc(),
): ResidenceRow[] {
  return [
    {
      id: crypto.randomUUID(),
      city: birthCity,
      range: [birthYear, latestComplete],
    },
  ]
}

export function isLivedFormValid(
  rows: ResidenceRow[],
  latestComplete = latestCompleteYearUtc(),
): boolean {
  const last = rows[rows.length - 1]
  if (!last || !rows.every((row) => row.city !== null)) {
    return false
  }
  return last.range[1] >= latestComplete
}
