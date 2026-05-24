export const MIN_BIRTH_YEAR = 1940

export function latestCompleteYearUtc(now = new Date()): number {
  return now.getUTCFullYear() - 1
}

export function birthYearOptions(
  min = MIN_BIRTH_YEAR,
  max = latestCompleteYearUtc(),
): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i)
}

/** Year labels for the timeline header (always includes birth + latest complete). */
export function timelineTickYears(
  birthYear: number,
  latest: number,
  maxTicks = 6,
): number[] {
  const span = latest - birthYear
  if (span <= 0) {
    return [birthYear]
  }

  const count = Math.min(maxTicks, span + 1)
  const years: number[] = []

  for (let i = 0; i < count; i += 1) {
    years.push(
      i === count - 1 ? latest : Math.round(birthYear + (span * i) / (count - 1)),
    )
  }

  return [...new Set(years)].sort((a, b) => a - b)
}

/** Even visual spacing along the slider axis (index-based, not calendar-linear). */
export function timelineTickPositionPercent(index: number, tickCount: number): number {
  if (tickCount <= 1) {
    return 0
  }
  return (index / (tickCount - 1)) * 100
}

/** Thumb position on the slider track (calendar-linear, matches slider min/max). */
export function yearToTimelinePercent(
  year: number,
  birthYear: number,
  latest: number,
): number {
  if (latest <= birthYear) {
    return 0
  }
  return ((year - birthYear) / (latest - birthYear)) * 100
}

const TICK_LABEL_CLASH_THRESHOLD_PCT = 7

export function timelineTickHiddenWhileDragging(
  tickIndex: number,
  tickCount: number,
  tickYear: number,
  dragYear: number,
  dragPercent: number,
): boolean {
  if (tickYear === dragYear) {
    return true
  }
  return (
    Math.abs(timelineTickPositionPercent(tickIndex, tickCount) - dragPercent) <
    TICK_LABEL_CLASH_THRESHOLD_PCT
  )
}
