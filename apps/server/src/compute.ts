import { getClimateDaily, getGeocode, getWeatherDaily } from "./cache.js";
import { alpha2ToAlpha3 } from "./iso.js";
import {
  getCo2PpmForYear,
  getEmissionsByIsoForYear,
  getEmissionsForYear,
  getLatestCo2Ppm,
  getLatestEmissions,
  getLatestEmissionsByIso,
  getLatestSeaLevel,
  getSeaLevelForYear,
} from "./sources/bundled.js";
import type { ClimateRow, WeatherRow } from "./db.js";

// ---------- types ----------

export type CityStay = {
  city: string;
  country?: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
};

export type GenerateInput = {
  birthDate: string;     // YYYY-MM-DD
  birthCity: string;
  birthCountry?: string;
  citiesLivedIn: CityStay[];
};

export type Cell = {
  id: number;
  label: string;
  value: string | number | null;
  detail?: string;
  /** Optional structured payload for the UI (numbers, units, deltas). */
  data?: Record<string, unknown>;
};

export type GenerateOutput = {
  visitor: {
    birthDate: string;
    birthCity: string;
    birthPlaceResolved: string | null;
    coords: { lat: number; lon: number } | null;
  };
  cells: Cell[];
  generatedAt: string;
};

// ---------- helpers ----------

const NORTHERN_SUMMER = [4, 5, 6, 7, 8, 9]; // Apr-Sep
const NORTHERN_WINTER = [10, 11, 12, 1, 2, 3]; // Oct-Mar

function isInMonths(date: string, months: number[]): boolean {
  const m = Number(date.slice(5, 7));
  return months.includes(m);
}

function pickExtreme(rows: WeatherRow[], key: "tmax" | "tmin", mode: "max" | "min"):
  { value: number; date: string } | null {
  let best: { value: number; date: string } | null = null;
  for (const r of rows) {
    const v = r[key];
    if (v === null || !Number.isFinite(v)) continue;
    if (best === null) best = { value: v, date: r.date };
    else if (mode === "max" && v > best.value) best = { value: v, date: r.date };
    else if (mode === "min" && v < best.value) best = { value: v, date: r.date };
  }
  return best;
}

function inDateRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function birthdayInYear(birthDate: string, year: number): string {
  const mmdd = birthDate.slice(5);
  return `${year}-${mmdd}`;
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

function pct(n: number, digits = 1): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

// Map ISO country names from Open-Meteo geocoder to OWID convention.
// Most match by "India", "United States", etc., but a few diverge.
const OWID_COUNTRY_ALIASES: Record<string, string> = {
  USA: "United States",
  UK: "United Kingdom",
};

function owidCountry(name: string | null | undefined): string | null {
  if (!name) return null;
  return OWID_COUNTRY_ALIASES[name] ?? name;
}

// ---------- per-cell builders ----------

async function cellsBirthYearExtremes(
  lat: number,
  lon: number,
  birthYear: number,
): Promise<{ hi: Cell; lo: Cell }> {
  const start = `${birthYear}-01-01`;
  const end = `${birthYear}-12-31`;
  const rows = await getWeatherDaily(lat, lon, start, end);
  const hi = pickExtreme(rows, "tmax", "max");
  const lo = pickExtreme(rows, "tmin", "min");
  return {
    hi: {
      id: 2,
      label: "Highest temp in birth year",
      value: hi ? fmt(hi.value) + "°C" : null,
      detail: hi ? `on ${hi.date}` : "no data",
      data: hi ? { temp_c: hi.value, date: hi.date } : undefined,
    },
    lo: {
      id: 3,
      label: "Lowest temp in birth year",
      value: lo ? fmt(lo.value) + "°C" : null,
      detail: lo ? `on ${lo.date}` : "no data",
      data: lo ? { temp_c: lo.value, date: lo.date } : undefined,
    },
  };
}

async function cellsLatestBirthdayExtremes(
  lat: number,
  lon: number,
  birthDate: string,
): Promise<{ hi: Cell; lo: Cell; latestBirthdayYear: number }> {
  // "Latest birthday" = most recent birthday on or before today.
  const today = new Date();
  const [, mm, dd] = birthDate.split("-").map(Number) as [number, number, number];
  const thisYearBday = new Date(today.getFullYear(), mm - 1, dd);
  const yearOfLatest =
    thisYearBday <= today ? today.getFullYear() : today.getFullYear() - 1;
  const target = birthdayInYear(birthDate, yearOfLatest);
  const rows = await getWeatherDaily(lat, lon, target, target);
  const row = rows[0];
  const hasMax = row && row.tmax !== null;
  const hasMin = row && row.tmin !== null;
  return {
    latestBirthdayYear: yearOfLatest,
    hi: {
      id: 4,
      label: "Highest temp on latest birthday",
      value: hasMax ? fmt(row!.tmax!) + "°C" : null,
      detail: `on ${target}`,
      data: hasMax ? { temp_c: row!.tmax, date: target } : undefined,
    },
    lo: {
      id: 5,
      label: "Lowest temp on latest birthday",
      value: hasMin ? fmt(row!.tmin!) + "°C" : null,
      detail: `on ${target}`,
      data: hasMin ? { temp_c: row!.tmin, date: target } : undefined,
    },
  };
}

async function cellsSeasonalRangeAcrossCities(
  stays: Array<{ city: string; country?: string; start: string; end: string; lat: number; lon: number }>,
): Promise<{ summer: Cell; winter: Cell }> {
  type Per = { city: string; tmaxAvg: number | null; tminAvg: number | null };
  const summerStats: Per[] = [];
  const winterStats: Per[] = [];

  for (const s of stays) {
    const rows = await getWeatherDaily(s.lat, s.lon, s.start, s.end);
    const sum = rows.filter((r) => isInMonths(r.date, NORTHERN_SUMMER));
    const win = rows.filter((r) => isInMonths(r.date, NORTHERN_WINTER));
    const avg = (xs: (number | null)[]) => {
      const f = xs.filter((x): x is number => x !== null && Number.isFinite(x));
      return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
    };
    summerStats.push({
      city: s.city,
      tmaxAvg: avg(sum.map((r) => r.tmax)),
      tminAvg: avg(sum.map((r) => r.tmin)),
    });
    winterStats.push({
      city: s.city,
      tmaxAvg: avg(win.map((r) => r.tmax)),
      tminAvg: avg(win.map((r) => r.tmin)),
    });
  }

  const buildCell = (id: number, label: string, stats: Per[]): Cell => {
    const maxes = stats.map((s) => s.tmaxAvg).filter((x): x is number => x !== null);
    const mins = stats.map((s) => s.tminAvg).filter((x): x is number => x !== null);
    if (!maxes.length || !mins.length) {
      return { id, label, value: null, detail: "insufficient data" };
    }
    const hi = Math.max(...maxes);
    const lo = Math.min(...mins);
    const range = hi - lo;
    const hottest = stats.find((s) => s.tmaxAvg === hi);
    const coldest = stats.find((s) => s.tminAvg === lo);
    return {
      id,
      label,
      value: `${fmt(range)}°C span`,
      detail: `${fmt(lo)}°C (${coldest?.city ?? "?"}) → ${fmt(hi)}°C (${hottest?.city ?? "?"})`,
      data: { rangeC: range, hi, lo, perCity: stats },
    };
  };

  return {
    summer: buildCell(6, "Summer temp range across cities", summerStats),
    winter: buildCell(7, "Winter temp range across cities", winterStats),
  };
}

function cellEmissionsLifetime(
  country: string | null,
  countryCode: string | null,
  birthYear: number,
): Cell {
  // Prefer ISO alpha-3 lookup (bypasses name aliasing). Fall back to country
  // name with the alias map only if ISO path misses.
  const iso3 = alpha2ToAlpha3(countryCode);
  let label = "Change in national CO₂ emissions (lifetime)";
  let resolvedCountry: string | null = null;
  let start: number | null = null;
  let latest: { year: number; co2_mt: number } | null = null;

  if (iso3) {
    const startRow = getEmissionsByIsoForYear(iso3, birthYear);
    const latestRow = getLatestEmissionsByIso(iso3);
    if (latestRow) {
      resolvedCountry = latestRow.country;
      latest = { year: latestRow.year, co2_mt: latestRow.co2_mt };
      start = startRow?.co2_mt ?? null;
    }
  }

  if (!latest) {
    const named = owidCountry(country);
    if (named) {
      const s = getEmissionsForYear(named, birthYear);
      const l = getLatestEmissions(named);
      if (l) {
        resolvedCountry = named;
        latest = l;
        start = s;
      }
    }
  }

  if (!resolvedCountry) {
    return { id: 8, label, value: null, detail: "country unknown" };
  }
  if (!latest || start === null) {
    return { id: 8, label, value: null, detail: `no data for ${resolvedCountry}` };
  }
  const delta = latest.co2_mt - start;
  const pctChange = (delta / start) * 100;
  return {
    id: 8,
    label,
    value: pct(pctChange),
    detail: `${resolvedCountry}: ${fmt(start, 0)} Mt (${birthYear}) → ${fmt(latest.co2_mt, 0)} Mt (${latest.year})`,
    data: {
      country: resolvedCountry,
      iso3: iso3 ?? null,
      birthYearMt: start,
      latestMt: latest.co2_mt,
      latestYear: latest.year,
      pctChange,
    },
  };
}

async function cellRainfallLifetime(
  lat: number,
  lon: number,
  birthYear: number,
): Promise<Cell> {
  // Compare mean annual rainfall: birth-year decade vs latest decade.
  const today = new Date().getFullYear();
  const earlyStart = `${birthYear}-01-01`;
  const earlyEnd = `${Math.min(birthYear + 9, today)}-12-31`;
  const lateStart = `${today - 10}-01-01`;
  const lateEnd = `${today - 1}-12-31`;

  const [early, late] = await Promise.all([
    getWeatherDaily(lat, lon, earlyStart, earlyEnd),
    getWeatherDaily(lat, lon, lateStart, lateEnd),
  ]);

  const annualMean = (rows: WeatherRow[]): number | null => {
    const byYear = new Map<string, number>();
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.precip === null || !Number.isFinite(r.precip)) continue;
      const y = r.date.slice(0, 4);
      byYear.set(y, (byYear.get(y) ?? 0) + r.precip);
      counts.set(y, (counts.get(y) ?? 0) + 1);
    }
    const totals = [...byYear.entries()]
      .filter(([y]) => (counts.get(y) ?? 0) > 300) // require ~complete year
      .map(([, t]) => t);
    return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
  };

  const e = annualMean(early);
  const l = annualMean(late);
  if (e === null || l === null) {
    return {
      id: 9,
      label: "Change in rainfall in birth city (lifetime)",
      value: null,
      detail: "insufficient data",
    };
  }
  const pctChange = ((l - e) / e) * 100;
  return {
    id: 9,
    label: "Change in rainfall in birth city (lifetime)",
    value: pct(pctChange),
    detail: `${fmt(e, 0)} mm/yr (${birthYear}s) → ${fmt(l, 0)} mm/yr (${today - 10}s)`,
    data: { earlyMm: e, lateMm: l, pctChange },
  };
}

function cellSeaLevelLifetime(birthYear: number): Cell {
  const start = getSeaLevelForYear(birthYear);
  const latest = getLatestSeaLevel();
  if (!latest) {
    return { id: 10, label: "Sea-level rise (lifetime)", value: null, detail: "no data" };
  }
  if (!start) {
    // Pre-1993 birthYear with no CSIRO splice: report latest only.
    return {
      id: 10,
      label: "Sea-level rise (lifetime)",
      value: `${fmt(latest.gmsl_mm, 0)} mm`,
      detail: `current GMSL anomaly (no pre-${latest.date.slice(0, 4)} baseline)`,
      data: { latest_mm: latest.gmsl_mm, latestDate: latest.date },
    };
  }
  const rise = latest.gmsl_mm - start.gmsl_mm;
  return {
    id: 10,
    label: "Sea-level rise (lifetime)",
    value: `+${fmt(rise, 0)} mm`,
    detail: `${fmt(start.gmsl_mm, 0)} mm (${start.date.slice(0, 4)}) → ${fmt(latest.gmsl_mm, 0)} mm (${latest.date.slice(0, 4)})`,
    data: { start: start, latest, rise_mm: rise },
  };
}

function cellCo2PpmCompare(birthYear: number): Cell {
  const start = getCo2PpmForYear(birthYear);
  const latest = getLatestCo2Ppm();
  if (!latest) {
    return { id: 11, label: "CO₂ ppm: birth year vs today", value: null, detail: "no data" };
  }
  if (start === null) {
    return {
      id: 11,
      label: "CO₂ ppm: birth year vs today",
      value: `${fmt(latest.ppm)} ppm`,
      detail: `current (no pre-1958 record for ${birthYear})`,
      data: { latest_ppm: latest.ppm, latest_year: latest.year },
    };
  }
  const delta = latest.ppm - start;
  return {
    id: 11,
    label: "CO₂ ppm: birth year vs today",
    value: `+${fmt(delta)} ppm`,
    detail: `${fmt(start)} (${birthYear}) → ${fmt(latest.ppm)} (${latest.year})`,
    data: { start_ppm: start, latest_ppm: latest.ppm, latest_year: latest.year, delta },
  };
}

async function cell2050Projection(lat: number, lon: number, birthDate: string): Promise<Cell> {
  // Use birthday in 2050 ± 7 days as the projection window.
  const target2050 = birthdayInYear(birthDate, 2050);
  const t = new Date(target2050 + "T00:00:00Z").getTime();
  const start = new Date(t - 7 * 86400000).toISOString().slice(0, 10);
  const end = new Date(t + 7 * 86400000).toISOString().slice(0, 10);

  let rows: ClimateRow[] = [];
  try {
    rows = await getClimateDaily(lat, lon, start, end);
  } catch {
    rows = [];
  }
  const tmaxes = rows.map((r) => r.tmax).filter((x): x is number => x !== null);
  const tmins = rows.map((r) => r.tmin).filter((x): x is number => x !== null);
  if (!tmaxes.length || !tmins.length) {
    return {
      id: 12,
      label: "Projected temp on your 2050 birthday",
      value: null,
      detail: "no projection available",
    };
  }
  const hi = Math.max(...tmaxes);
  const lo = Math.min(...tmins);
  return {
    id: 12,
    label: "Projected temp on your 2050 birthday",
    value: `${fmt(lo)}–${fmt(hi)}°C`,
    detail: `CMIP6, ±7d window around ${target2050}`,
    data: { hi, lo, target: target2050 },
  };
}

// ---------- top-level orchestrator ----------

export async function generateKundli(input: GenerateInput): Promise<GenerateOutput> {
  const birthYear = Number(input.birthDate.slice(0, 4));

  const birthGeo = await getGeocode(input.birthCity, input.birthCountry);
  if (!birthGeo) {
    throw new Error(`could not geocode birth city: ${input.birthCity}`);
  }

  // Build the full list of stays for cells 6/7. Birth city counts as a stay
  // from birth date to either the start of the next stay or today.
  const stays = [
    {
      city: birthGeo.displayName,
      country: birthGeo.country ?? undefined,
      start: input.birthDate,
      end: input.citiesLivedIn[0]?.start ?? todayIso(),
      lat: birthGeo.lat,
      lon: birthGeo.lon,
    },
  ];
  for (const s of input.citiesLivedIn) {
    const g = await getGeocode(s.city, s.country);
    if (!g) continue;
    stays.push({
      city: g.displayName,
      country: g.country ?? undefined,
      start: s.start,
      end: s.end,
      lat: g.lat,
      lon: g.lon,
    });
  }

  // Run cell builders. Bundled-CSV cells are sync; weather cells are async
  // and benefit from being kicked off in parallel.
  const [byExtremes, latestBdayExtremes, seasonal, rainfall, projection] = await Promise.all([
    cellsBirthYearExtremes(birthGeo.lat, birthGeo.lon, birthYear),
    cellsLatestBirthdayExtremes(birthGeo.lat, birthGeo.lon, input.birthDate),
    cellsSeasonalRangeAcrossCities(stays),
    cellRainfallLifetime(birthGeo.lat, birthGeo.lon, birthYear),
    cell2050Projection(birthGeo.lat, birthGeo.lon, input.birthDate),
  ]);

  const emissionsCell = cellEmissionsLifetime(birthGeo.country, birthGeo.countryCode, birthYear);
  const seaCell = cellSeaLevelLifetime(birthYear);
  const co2Cell = cellCo2PpmCompare(birthYear);

  const cells: Cell[] = [
    {
      id: 1,
      label: "You",
      value: input.birthCity,
      detail: `Born ${input.birthDate}`,
      data: { birthDate: input.birthDate, birthPlace: birthGeo.displayName },
    },
    byExtremes.hi,
    byExtremes.lo,
    latestBdayExtremes.hi,
    latestBdayExtremes.lo,
    seasonal.summer,
    seasonal.winter,
    emissionsCell,
    rainfall,
    seaCell,
    co2Cell,
    projection,
  ];

  return {
    visitor: {
      birthDate: input.birthDate,
      birthCity: input.birthCity,
      birthPlaceResolved: birthGeo.displayName,
      coords: { lat: birthGeo.lat, lon: birthGeo.lon },
    },
    cells,
    generatedAt: new Date().toISOString(),
  };
}

// Mark unused-but-kept helpers so noUnused* doesn't bite. (inDateRange may be
// used by downstream filters; keep the export.)
export const __helpers = { inDateRange };
