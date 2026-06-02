import type { WeatherDaily } from "../resolvers/historical.js";

/** Daily total ≥ this counts as a very heavy rain day (roughly cloudburst-grade). */
export const HEAVY_RAIN_MM = 50;

export interface MonthlyPrecipStats {
  monthly: (number | null)[];
  monthlyMin: (number | null)[];
  monthlyMax: (number | null)[];
}

export interface RainfallInsight {
  heavyRainThresholdMm: number;
  thenDaysPerYear: number;
  nowDaysPerYear: number;
  deltaDaysPerYear: number;
  birthWindow: MonthlyPrecipStats & { startYear: number; endYear: number };
  recentWindow: MonthlyPrecipStats & { startYear: number; endYear: number };
  largestDelta: { month: number; delta: number } | null;
  monsoonPctChange: number | null;
}

/** Mean monthly rainfall (mm) per calendar month, averaged across years in the window. */
export function monthlyPrecipStats(
  daily: WeatherDaily[],
  startYear: number,
  endYear: number,
): MonthlyPrecipStats {
  const yearMonthSums = new Map<string, number>();

  for (const day of daily) {
    const year = Number(day.date.slice(0, 4));
    if (year < startYear || year > endYear) continue;
    if (day.precip == null) continue;

    const monthIndex = Number(day.date.slice(5, 7)) - 1;
    const key = `${year}-${monthIndex}`;
    yearMonthSums.set(key, (yearMonthSums.get(key) ?? 0) + day.precip);
  }

  const monthly = new Array<number | null>(12).fill(null);
  const monthlyMin = new Array<number | null>(12).fill(null);
  const monthlyMax = new Array<number | null>(12).fill(null);

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const yearlyTotals: number[] = [];
    for (let year = startYear; year <= endYear; year += 1) {
      const total = yearMonthSums.get(`${year}-${monthIndex}`);
      if (total != null) {
        yearlyTotals.push(total);
      }
    }
    if (yearlyTotals.length > 0) {
      monthly[monthIndex] = roundMm(yearlyTotals.reduce((s, v) => s + v, 0) / yearlyTotals.length);
      monthlyMin[monthIndex] = roundMm(Math.min(...yearlyTotals));
      monthlyMax[monthIndex] = roundMm(Math.max(...yearlyTotals));
    }
  }

  return { monthly, monthlyMin, monthlyMax };
}

export function meanHeavyRainDaysPerYear(
  daily: WeatherDaily[],
  startYear: number,
  endYear: number,
  thresholdMm = HEAVY_RAIN_MM,
): number | null {
  const yearsInWindow = endYear - startYear + 1;
  if (yearsInWindow <= 0) return null;

  let heavyDays = 0;
  let hasPrecip = false;

  for (const day of daily) {
    const year = Number(day.date.slice(0, 4));
    if (year < startYear || year > endYear) continue;
    if (day.precip == null) continue;
    hasPrecip = true;
    if (day.precip >= thresholdMm) {
      heavyDays += 1;
    }
  }

  if (!hasPrecip) return null;
  return Math.round((heavyDays / yearsInWindow) * 10) / 10;
}

export function largestDeltaMonth(
  a: (number | null)[],
  b: (number | null)[],
): { month: number; delta: number } | null {
  let bestMonth = -1;
  let bestAbs = -Infinity;
  let bestSigned = 0;

  for (let m = 0; m < 12; m += 1) {
    if (a[m] == null || b[m] == null) continue;
    const delta = (b[m] as number) - (a[m] as number);
    const abs = Math.abs(delta);
    if (abs > bestAbs) {
      bestAbs = abs;
      bestSigned = delta;
      bestMonth = m;
    }
  }

  return bestMonth >= 0 ? { month: bestMonth, delta: roundMm(bestSigned) } : null;
}

/** Jun–Sep total rainfall, % change from then window to now window. */
export function monsoonPercentChange(
  thenMonthly: (number | null)[],
  nowMonthly: (number | null)[],
): number | null {
  const MONSOON_MONTHS = [5, 6, 7, 8];
  let thenSum = 0;
  let nowSum = 0;
  let thenCount = 0;
  let nowCount = 0;

  for (const m of MONSOON_MONTHS) {
    const t = thenMonthly[m];
    const n = nowMonthly[m];
    if (t != null) {
      thenSum += t;
      thenCount += 1;
    }
    if (n != null) {
      nowSum += n;
      nowCount += 1;
    }
  }

  if (thenCount < 3 || nowCount < 3 || thenSum <= 0) return null;
  return Math.round(((nowSum - thenSum) / thenSum) * 1000) / 10;
}

export function buildRainfallInsight(
  daily: WeatherDaily[],
  birthStart: number,
  birthEnd: number,
  recentStart: number,
  recentEnd: number,
): RainfallInsight | null {
  const birthPrecip = monthlyPrecipStats(daily, birthStart, birthEnd);
  const recentPrecip = monthlyPrecipStats(daily, recentStart, recentEnd);

  const hasAny = birthPrecip.monthly.some((v) => v != null) || recentPrecip.monthly.some((v) => v != null);
  if (!hasAny) return null;

  const thenDays = meanHeavyRainDaysPerYear(daily, birthStart, birthEnd);
  const nowDays = meanHeavyRainDaysPerYear(daily, recentStart, recentEnd);
  if (thenDays == null || nowDays == null) return null;

  return {
    heavyRainThresholdMm: HEAVY_RAIN_MM,
    thenDaysPerYear: thenDays,
    nowDaysPerYear: nowDays,
    deltaDaysPerYear: roundMm(nowDays - thenDays),
    birthWindow: { startYear: birthStart, endYear: birthEnd, ...birthPrecip },
    recentWindow: { startYear: recentStart, endYear: recentEnd, ...recentPrecip },
    largestDelta: largestDeltaMonth(birthPrecip.monthly, recentPrecip.monthly),
    monsoonPctChange: monsoonPercentChange(birthPrecip.monthly, recentPrecip.monthly),
  };
}

function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}
