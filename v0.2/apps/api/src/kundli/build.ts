// /api/kundli builder.
//
// Given a birth slug+date and an optional list of lived-in stays, build the
// 12-cell exhibition response by talking only to Supabase. Every cell is
// independent — we run them in parallel and assemble at the end.
//
// Source for v0.2 first pass is hard-coded to "era5". When IMD lands (phase
// 6) we'll select per-cell source via place_grid_map.source_priority.

import { sql } from "../db.js";
import type { Cell, KundliResponse, KundliStay } from "./types.js";

const SOURCE = "era5";
const PENDING_REASON = "dataset not yet ingested in v0.2";

// ---------------------------------------------------------------------------
// inputs
// ---------------------------------------------------------------------------

export type KundliInput = {
  birthSlug: string;
  birthDate: string;             // YYYY-MM-DD
  lived: { slug: string; start: string; end: string }[];
};

type Place = {
  id: number;
  slug: string;
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const NORTHERN_SUMMER = new Set([4, 5, 6, 7, 8, 9]);

function birthdayInYear(birthDate: string, year: number): string {
  // birthDate = YYYY-MM-DD; replace year. Feb 29 → Feb 28 in non-leap years.
  const m = birthDate.slice(5, 7);
  const d = birthDate.slice(8, 10);
  if (m === "02" && d === "29") {
    const yy = year;
    const isLeap = (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0;
    return `${year}-02-${isLeap ? "29" : "28"}`;
  }
  return `${year}-${m}-${d}`;
}

function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const iso = typeof d === "string" ? d : d.toISOString().slice(0, 10);
  return iso.slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function pendingCell(id: number, kind: Cell["kind"], label: string): Cell {
  return {
    id,
    kind,
    status: "pending_dataset",
    label,
    primary: null,
    detail: PENDING_REASON,
  };
}

// ---------------------------------------------------------------------------
// place resolution
// ---------------------------------------------------------------------------

async function fetchPlace(slug: string): Promise<Place | null> {
  const rows = await sql/* sql */`
    SELECT id, slug, name, country, country_code, lat, lon
      FROM places WHERE slug = ${slug.toLowerCase()} LIMIT 1
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    slug: r.slug as string,
    name: r.name as string,
    country: r.country as string,
    countryCode: r.country_code as string,
    lat: Number(r.lat),
    lon: Number(r.lon),
  };
}

// ---------------------------------------------------------------------------
// cell builders
// ---------------------------------------------------------------------------

async function cellBirthYearExtremes(
  birthPlace: Place,
  birthYear: number,
): Promise<{ hi: Cell; lo: Cell }> {
  const rows = await sql/* sql */`
    SELECT max_temp_c, max_temp_date, min_temp_c, min_temp_date,
           valid_days, quality
      FROM annual_extremes
     WHERE place_id = ${birthPlace.id} AND source = ${SOURCE} AND year = ${birthYear}
     LIMIT 1
  `;
  const r = rows[0];
  if (!r) {
    return {
      hi: { id: 2, kind: "birth_year_hi", status: "no_data",
            label: "Hottest day, your birth year", primary: null,
            detail: `No daily data for ${birthPlace.name}, ${birthYear} yet.` },
      lo: { id: 3, kind: "birth_year_lo", status: "no_data",
            label: "Coldest day, your birth year", primary: null,
            detail: `No daily data for ${birthPlace.name}, ${birthYear} yet.` },
    };
  }
  const provenance = {
    source: SOURCE,
    quality: Number(r.quality),
    validDays: Number(r.valid_days),
  };
  return {
    hi: {
      id: 2, kind: "birth_year_hi", status: "ok",
      label: "Hottest day, your birth year",
      primary: `${fmt(Number(r.max_temp_c))}°C`,
      detail: `${birthPlace.name} · ${fmtDate(r.max_temp_date)}`,
      data: { tempC: Number(r.max_temp_c), date: fmtDate(r.max_temp_date), year: birthYear },
      provenance,
    },
    lo: {
      id: 3, kind: "birth_year_lo", status: "ok",
      label: "Coldest day, your birth year",
      primary: `${fmt(Number(r.min_temp_c))}°C`,
      detail: `${birthPlace.name} · ${fmtDate(r.min_temp_date)}`,
      data: { tempC: Number(r.min_temp_c), date: fmtDate(r.min_temp_date), year: birthYear },
      provenance,
    },
  };
}

async function cellLatestBirthdayExtremes(
  birthPlace: Place,
  birthDate: string,
): Promise<{ hi: Cell; lo: Cell }> {
  // "Most-recent birthday" = the latest birthday whose date <= today.
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const bdayThisYear = birthdayInYear(birthDate, thisYear);
  const latestBday = bdayThisYear <= today
    ? bdayThisYear
    : birthdayInYear(birthDate, thisYear - 1);

  // Try the exact day first.
  const daily = await sql/* sql */`
    SELECT date, tmax_c, tmin_c, quality
      FROM daily_weather
     WHERE place_id = ${birthPlace.id} AND source = ${SOURCE} AND date = ${latestBday}
     LIMIT 1
  `;
  if (daily[0] && (daily[0].tmax_c !== null || daily[0].tmin_c !== null)) {
    const r = daily[0];
    const provenance = { source: SOURCE, quality: Number(r.quality), fallback: null };
    return {
      hi: { id: 4, kind: "latest_birthday_hi", status: "ok",
        label: "Hottest, your last birthday",
        primary: `${fmt(Number(r.tmax_c))}°C`,
        detail: `${birthPlace.name} · ${latestBday}`,
        data: { tempC: Number(r.tmax_c), date: latestBday },
        provenance },
      lo: { id: 5, kind: "latest_birthday_lo", status: "ok",
        label: "Coldest, your last birthday",
        primary: `${fmt(Number(r.tmin_c))}°C`,
        detail: `${birthPlace.name} · ${latestBday}`,
        data: { tempC: Number(r.tmin_c), date: latestBday },
        provenance },
    };
  }

  // Fall back to monthly_normals for the birth month.
  const month = Number(birthDate.slice(5, 7));
  const norm = await sql/* sql */`
    SELECT tmax_avg_c, tmin_avg_c, baseline_start, baseline_end, quality
      FROM monthly_normals
     WHERE place_id = ${birthPlace.id} AND source = ${SOURCE} AND month = ${month}
     ORDER BY
       CASE WHEN baseline_start = 1991 AND baseline_end = 2020 THEN 0 ELSE 1 END,
       (baseline_end - baseline_start) DESC
     LIMIT 1
  `;
  if (norm[0]) {
    const r = norm[0];
    const provenance = {
      source: SOURCE,
      quality: Number(r.quality),
      fallback: "monthly_normals" as const,
    };
    return {
      hi: { id: 4, kind: "latest_birthday_hi", status: "ok",
        label: "Hottest, your last birthday",
        primary: `${fmt(Number(r.tmax_avg_c))}°C`,
        detail: `${birthPlace.name} · ${month}-month avg (${r.baseline_start}–${r.baseline_end})`,
        data: { tempC: Number(r.tmax_avg_c), month, baseline: [r.baseline_start, r.baseline_end] },
        provenance },
      lo: { id: 5, kind: "latest_birthday_lo", status: "ok",
        label: "Coldest, your last birthday",
        primary: `${fmt(Number(r.tmin_avg_c))}°C`,
        detail: `${birthPlace.name} · ${month}-month avg (${r.baseline_start}–${r.baseline_end})`,
        data: { tempC: Number(r.tmin_avg_c), month, baseline: [r.baseline_start, r.baseline_end] },
        provenance },
    };
  }

  return {
    hi: { id: 4, kind: "latest_birthday_hi", status: "no_data",
      label: "Hottest, your last birthday", primary: null },
    lo: { id: 5, kind: "latest_birthday_lo", status: "no_data",
      label: "Coldest, your last birthday", primary: null },
  };
}

// Season prefix range avg via two endpoint lookups. Returns null if no data.
async function seasonRangeAvg(
  placeId: number,
  season: "summer" | "winter",
  start: string,
  end: string,
): Promise<{ tmax: number; tmin: number; days: number } | null> {
  const rows = await sql/* sql */`
    SELECT
      (SELECT row_to_json(t) FROM (
        SELECT tmax_cum, tmin_cum, count_cum
          FROM season_prefix
         WHERE place_id = ${placeId} AND source = ${SOURCE}
           AND season = ${season} AND date <= ${end}
         ORDER BY date DESC LIMIT 1
      ) t) AS end_row,
      (SELECT row_to_json(t) FROM (
        SELECT tmax_cum, tmin_cum, count_cum
          FROM season_prefix
         WHERE place_id = ${placeId} AND source = ${SOURCE}
           AND season = ${season} AND date < ${start}
         ORDER BY date DESC LIMIT 1
      ) t) AS start_row
  `;
  const r = rows[0];
  const endRow = (r?.end_row ?? null) as { tmax_cum: number; tmin_cum: number; count_cum: number } | null;
  if (!endRow) return null;
  const startRow = (r?.start_row ?? null) as { tmax_cum: number; tmin_cum: number; count_cum: number } | null;
  const days = Number(endRow.count_cum) - Number(startRow?.count_cum ?? 0);
  if (days <= 0) return null;
  return {
    tmax: (Number(endRow.tmax_cum) - Number(startRow?.tmax_cum ?? 0)) / days,
    tmin: (Number(endRow.tmin_cum) - Number(startRow?.tmin_cum ?? 0)) / days,
    days,
  };
}

async function cellsSeasonalRangeAcrossCities(
  stays: { place: Place; start: string; end: string }[],
): Promise<{ summer: Cell; winter: Cell }> {
  // For each season, compute per-stay range avg, then average across stays
  // weighted by valid-day count. Stays whose entire window predates our
  // daily_weather coverage (e.g. 1995 with only 2020 ingested) contribute 0
  // days and are dropped — UI sees a smaller "based on N cities" number.
  const summerParts = await Promise.all(stays.map((s) => seasonRangeAvg(s.place.id, "summer", s.start, s.end)));
  const winterParts = await Promise.all(stays.map((s) => seasonRangeAvg(s.place.id, "winter", s.start, s.end)));

  function combine(parts: (Awaited<ReturnType<typeof seasonRangeAvg>>)[]) {
    let tmaxSum = 0, tminSum = 0, daysSum = 0;
    const contributing: string[] = [];
    parts.forEach((p, i) => {
      if (!p) return;
      tmaxSum += p.tmax * p.days;
      tminSum += p.tmin * p.days;
      daysSum += p.days;
      const place = stays[i]?.place;
      if (place) contributing.push(place.name);
    });
    return daysSum > 0
      ? { tmaxAvg: tmaxSum / daysSum, tminAvg: tminSum / daysSum, days: daysSum, contributing }
      : null;
  }

  const summer = combine(summerParts);
  const winter = combine(winterParts);

  function plural(n: number) { return n === 1 ? "city" : "cities"; }

  return {
    summer: summer
      ? {
          id: 6, kind: "seasonal_summer", status: "ok",
          label: "Your summers, averaged",
          primary: `${fmt(summer.tmaxAvg)}°C / ${fmt(summer.tminAvg)}°C`,
          detail: `${summer.contributing.length} ${plural(summer.contributing.length)} · ${summer.days} days · ${summer.contributing.join(", ")}`,
          data: { tmaxAvgC: summer.tmaxAvg, tminAvgC: summer.tminAvg, days: summer.days,
                  contributing: summer.contributing },
          provenance: { source: SOURCE },
        }
      : { id: 6, kind: "seasonal_summer", status: "no_data",
          label: "Your summers, averaged", primary: null,
          detail: `No data in your stay windows yet.` },
    winter: winter
      ? {
          id: 7, kind: "seasonal_winter", status: "ok",
          label: "Your winters, averaged",
          primary: `${fmt(winter.tmaxAvg)}°C / ${fmt(winter.tminAvg)}°C`,
          detail: `${winter.contributing.length} ${plural(winter.contributing.length)} · ${winter.days} days · ${winter.contributing.join(", ")}`,
          data: { tmaxAvgC: winter.tmaxAvg, tminAvgC: winter.tminAvg, days: winter.days,
                  contributing: winter.contributing },
          provenance: { source: SOURCE },
        }
      : { id: 7, kind: "seasonal_winter", status: "no_data",
          label: "Your winters, averaged", primary: null,
          detail: `No data in your stay windows yet.` },
  };
}

async function cellRainCompare(birthPlace: Place, birthYear: number): Promise<Cell> {
  const birthDecade = Math.floor(birthYear / 10) * 10;
  const latestDecade = Math.floor(Number(todayIso().slice(0, 4)) / 10) * 10;
  const rows = await sql/* sql */`
    SELECT decade_start, avg_annual_rain_mm, years_used
      FROM decade_rain
     WHERE place_id = ${birthPlace.id}
       AND source   = ${SOURCE}
       AND decade_start IN (${birthDecade}, ${latestDecade})
  `;
  const byDecade = new Map<number, { avg: number; years: number }>();
  for (const r of rows) {
    byDecade.set(Number(r.decade_start), {
      avg: r.avg_annual_rain_mm === null ? NaN : Number(r.avg_annual_rain_mm),
      years: Number(r.years_used),
    });
  }
  const b = byDecade.get(birthDecade);
  const l = byDecade.get(latestDecade);
  if (!b || !l) {
    return {
      id: 9, kind: "rain_compare", status: "no_data",
      label: "Annual rainfall: then vs now", primary: null,
      detail: rows.length === 0
        ? "Need ≥3 years per decade. Load more years to enable."
        : `Have only ${rows.length}/2 decades for ${birthPlace.name}.`,
    };
  }
  const deltaPct = ((l.avg - b.avg) / b.avg) * 100;
  return {
    id: 9, kind: "rain_compare", status: "ok",
    label: "Annual rainfall: then vs now",
    primary: `${deltaPct >= 0 ? "+" : ""}${fmt(deltaPct)}%`,
    detail: `${birthPlace.name} · ${fmt(b.avg, 0)} mm/yr (${birthDecade}s) → ${fmt(l.avg, 0)} mm/yr (${latestDecade}s)`,
    data: { birthDecadeMm: b.avg, latestDecadeMm: l.avg, deltaPct, birthDecade, latestDecade },
    provenance: { source: SOURCE },
  };
}

// ---------------------------------------------------------------------------
// main entry
// ---------------------------------------------------------------------------

export async function buildKundli(input: KundliInput): Promise<KundliResponse> {
  const t0 = Date.now();

  const birthPlace = await fetchPlace(input.birthSlug);
  if (!birthPlace) {
    const e = new Error(`birth place not found: ${input.birthSlug}`);
    (e as Error & { status: number }).status = 404;
    throw e;
  }

  // Resolve all lived stays. Skip slugs we don't know about — defensive
  // against an old web client passing a slug that was de-listed.
  const livedPlaces: { place: Place; start: string; end: string }[] = [];
  for (const s of input.lived) {
    const p = await fetchPlace(s.slug);
    if (p) livedPlaces.push({ place: p, start: s.start, end: s.end });
  }

  const birthYear = Number(input.birthDate.slice(0, 4));

  // Cell 6/7's "stays" include the birth city itself, from birth date to
  // either the first lived stay's start or today.
  const stays: { place: Place; start: string; end: string }[] = [
    {
      place: birthPlace,
      start: input.birthDate,
      end: livedPlaces[0]?.start ?? todayIso(),
    },
    ...livedPlaces,
  ];

  const [byExtremes, latestBday, seasonal, rain] = await Promise.all([
    cellBirthYearExtremes(birthPlace, birthYear),
    cellLatestBirthdayExtremes(birthPlace, input.birthDate),
    cellsSeasonalRangeAcrossCities(stays),
    cellRainCompare(birthPlace, birthYear),
  ]);

  const cells: Cell[] = [
    {
      id: 1, kind: "you", status: "ok",
      label: "You",
      primary: birthPlace.name,
      detail: `Born ${input.birthDate}`,
      data: { birthDate: input.birthDate, birthPlace: birthPlace.name, birthCountry: birthPlace.country },
    },
    byExtremes.hi,
    byExtremes.lo,
    latestBday.hi,
    latestBday.lo,
    seasonal.summer,
    seasonal.winter,
    pendingCell(8, "country_emissions", "Your country's lifetime emissions"),
    rain,
    pendingCell(10, "sea_level", "Global sea level, your lifetime"),
    pendingCell(11, "co2_ppm", "CO₂ ppm: then vs now"),
    pendingCell(12, "projection_2050", "Your birthplace in 2050"),
  ];

  return {
    visitor: {
      birthSlug: birthPlace.slug,
      birthName: birthPlace.name,
      birthCountry: birthPlace.country,
      birthDate: input.birthDate,
      birthYear,
      coords: { lat: birthPlace.lat, lon: birthPlace.lon },
    },
    stays: stays.map((s) => ({
      slug: s.place.slug,
      name: s.place.name,
      country: s.place.country,
      start: s.start,
      end: s.end,
    })),
    cells,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
  };
}
