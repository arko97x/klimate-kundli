// /api/kundli builder.
//
// Given a birth slug+date and an optional list of lived-in stays, build the
// 12-cell exhibition response by talking only to Supabase. Every cell is
// independent — we run them in parallel and assemble at the end.
//
// Source preference per variable (phase 6c + 7):
//   • temperature (cells 2-7): ghcn > imd_temp > era5 > open_meteo
//   • rainfall    (cell  9  ): ghcn > imd_rain > era5 > open_meteo
// GHCN station observations are the highest-priority overlay where a
// nearby station exists. IMD covers India only; direct ERA5 covers our
// pilot ingest window for India; Open-Meteo is the universal floor
// (ERA5 archive, 1940+, every place). Each query embeds the priority
// list and ORDER BYs on `array_position`, so adding another source is
// a one-line edit here.

import { sql } from "../db.js";
import type { Cell, KundliResponse, KundliStay } from "./types.js";

// Priority lists encoded once. Lower index = higher priority. The SQL
// ORDER BY uses `array_position` so adding a new source is a one-line
// edit. Order here mirrors `config.SOURCE_PRIORITY` on the ingest side.
const TEMP_SOURCES = ["ghcn", "imd_temp", "era5", "open_meteo"] as const;
const RAIN_SOURCES = ["ghcn", "imd_rain", "era5", "open_meteo"] as const;
const PENDING_REASON = "dataset not yet ingested in v0.2";

// Default scenario for cell 12. Mid-of-road SSP2-4.5 is the IPCC AR6
// recommended communicating-with-the-public choice; the table also stores
// SSP5-8.5 for sensitivity but the kundli surfaces just one number.
const PROJECTION_SCENARIO = "ssp245";
const PROJECTION_HORIZON = 2050;

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

function fmtSigned(n: number, digits = 1, unit = ""): string {
  if (!Number.isFinite(n)) return "—";
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(digits)}${unit}`;
}

// Largest year we have for an indicator. Used so the cell self-labels
// "1990 → 2024" instead of pretending we have current-year data when the
// CSV is a year or two behind.
async function latestYearFor(
  indicator: "co2_ppm" | "gmsl_mm",
): Promise<number | null> {
  const rows = await sql/* sql */`
    SELECT MAX(year) AS y FROM global_indices WHERE indicator = ${indicator}
  `;
  const y = rows[0]?.y;
  return y === null || y === undefined ? null : Number(y);
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
           valid_days, quality, source
      FROM annual_extremes
     WHERE place_id = ${birthPlace.id}
       AND source = ANY(${TEMP_SOURCES as unknown as string[]})
       AND year = ${birthYear}
     ORDER BY array_position(${TEMP_SOURCES as unknown as string[]}::text[], source)
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
    source: String(r.source),
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

  // Try the exact day first; prefer IMD over ERA5.
  const daily = await sql/* sql */`
    SELECT date, tmax_c, tmin_c, quality, source
      FROM daily_weather
     WHERE place_id = ${birthPlace.id}
       AND source = ANY(${TEMP_SOURCES as unknown as string[]})
       AND date = ${latestBday}
       AND (tmax_c IS NOT NULL OR tmin_c IS NOT NULL)
     ORDER BY array_position(${TEMP_SOURCES as unknown as string[]}::text[], source)
     LIMIT 1
  `;
  if (daily[0]) {
    const r = daily[0];
    const provenance = { source: String(r.source), quality: Number(r.quality), fallback: null };
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

  // Fall back to monthly_normals for the birth month, preferring IMD.
  const month = Number(birthDate.slice(5, 7));
  const norm = await sql/* sql */`
    SELECT tmax_avg_c, tmin_avg_c, baseline_start, baseline_end, quality, source
      FROM monthly_normals
     WHERE place_id = ${birthPlace.id}
       AND source = ANY(${TEMP_SOURCES as unknown as string[]})
       AND month = ${month}
     ORDER BY
       array_position(${TEMP_SOURCES as unknown as string[]}::text[], source),
       CASE WHEN baseline_start = 1991 AND baseline_end = 2020 THEN 0 ELSE 1 END,
       (baseline_end - baseline_start) DESC
     LIMIT 1
  `;
  if (norm[0]) {
    const r = norm[0];
    const provenance = {
      source: String(r.source),
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
// Picks the highest-priority source that has prefix coverage for this place;
// mixing sources within one place×season would produce a meaningless cum diff.
async function seasonRangeAvg(
  placeId: number,
  season: "summer" | "winter",
  start: string,
  end: string,
): Promise<{ tmax: number; tmin: number; days: number; source: string } | null> {
  // Pick which source has prefix rows for this (place, season) intersecting the
  // requested window. Falls back to era5 if imd_temp has nothing.
  const chosen = await sql/* sql */`
    SELECT source
      FROM season_prefix
     WHERE place_id = ${placeId}
       AND source = ANY(${TEMP_SOURCES as unknown as string[]})
       AND season = ${season} AND date <= ${end}
     ORDER BY array_position(${TEMP_SOURCES as unknown as string[]}::text[], source), date DESC
     LIMIT 1
  `;
  const src = chosen[0]?.source as string | undefined;
  if (!src) return null;

  const rows = await sql/* sql */`
    SELECT
      (SELECT row_to_json(t) FROM (
        SELECT tmax_cum, tmin_cum, count_cum
          FROM season_prefix
         WHERE place_id = ${placeId} AND source = ${src}
           AND season = ${season} AND date <= ${end}
         ORDER BY date DESC LIMIT 1
      ) t) AS end_row,
      (SELECT row_to_json(t) FROM (
        SELECT tmax_cum, tmin_cum, count_cum
          FROM season_prefix
         WHERE place_id = ${placeId} AND source = ${src}
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
    source: src,
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
    const sources = new Set<string>();
    parts.forEach((p, i) => {
      if (!p) return;
      tmaxSum += p.tmax * p.days;
      tminSum += p.tmin * p.days;
      daysSum += p.days;
      sources.add(p.source);
      const place = stays[i]?.place;
      if (place) contributing.push(place.name);
    });
    return daysSum > 0
      ? { tmaxAvg: tmaxSum / daysSum, tminAvg: tminSum / daysSum,
          days: daysSum, contributing, sources: [...sources] }
      : null;
  }

  const summer = combine(summerParts);
  const winter = combine(winterParts);

  function plural(n: number) { return n === 1 ? "city" : "cities"; }
  // When the same query mixes sources across stays (e.g. born in Delhi
  // using imd_temp and moved to Tokyo using open_meteo), report the
  // highest-priority source we used. Cells mixing sources are uncommon
  // enough that one tag in the pill is honest.
  function pickSource(sources: string[]): string {
    for (const s of TEMP_SOURCES) if (sources.includes(s)) return s;
    return sources[0] ?? "open_meteo";
  }

  return {
    summer: summer
      ? {
          id: 6, kind: "seasonal_summer", status: "ok",
          label: "Your summers, averaged",
          primary: `${fmt(summer.tmaxAvg)}°C / ${fmt(summer.tminAvg)}°C`,
          detail: `${summer.contributing.length} ${plural(summer.contributing.length)} · ${summer.days} days · ${summer.contributing.join(", ")}`,
          data: { tmaxAvgC: summer.tmaxAvg, tminAvgC: summer.tminAvg, days: summer.days,
                  contributing: summer.contributing },
          provenance: { source: pickSource(summer.sources) },
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
          provenance: { source: pickSource(winter.sources) },
        }
      : { id: 7, kind: "seasonal_winter", status: "no_data",
          label: "Your winters, averaged", primary: null,
          detail: `No data in your stay windows yet.` },
  };
}

async function cellRainCompare(birthPlace: Place, birthYear: number): Promise<Cell> {
  const birthDecade = Math.floor(birthYear / 10) * 10;
  const latestDecade = Math.floor(Number(todayIso().slice(0, 4)) / 10) * 10;
  // For each of the two decades, pick the best source. Mixing sources across
  // decades (e.g. imd_rain for 2020s, era5 for 1950s) would be apples-to-
  // oranges for the % change, so we require both rows from the same source.
  const rows = await sql/* sql */`
    WITH ranked AS (
      SELECT decade_start, avg_annual_rain_mm, years_used, source,
             array_position(${RAIN_SOURCES as unknown as string[]}::text[], source) AS prio
        FROM decade_rain
       WHERE place_id = ${birthPlace.id}
         AND source = ANY(${RAIN_SOURCES as unknown as string[]})
         AND decade_start IN (${birthDecade}, ${latestDecade})
    ),
    have_both AS (
      SELECT source, COUNT(DISTINCT decade_start) AS n
        FROM ranked GROUP BY source HAVING COUNT(DISTINCT decade_start) = 2
    ),
    chosen AS (
      SELECT r.* FROM ranked r
        JOIN have_both h USING (source)
       ORDER BY r.prio
    )
    SELECT decade_start, avg_annual_rain_mm, years_used, source
      FROM chosen
     WHERE source = (SELECT source FROM chosen ORDER BY prio LIMIT 1)
  `;
  const byDecade = new Map<number, { avg: number; years: number; source: string }>();
  for (const r of rows) {
    byDecade.set(Number(r.decade_start), {
      avg: r.avg_annual_rain_mm === null ? NaN : Number(r.avg_annual_rain_mm),
      years: Number(r.years_used),
      source: String(r.source),
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
    provenance: { source: b.source },
  };
}

// ---------------------------------------------------------------------------
// Phase 4.5 cells: 8 (country emissions), 10 (sea level), 11 (CO2 ppm),
// 12 (2050 projection). All four read from tables populated by
// `klimate-ingest load-global`. If the row is missing the cell falls back
// to `pending_dataset` so the UI still renders a skeleton.
// ---------------------------------------------------------------------------

async function cellCountryEmissions(
  birthPlace: Place,
  birthYear: number,
): Promise<Cell> {
  // Cumulative annual CO2 from birth year up to whatever the most recent
  // ingested year is. We sum on the DB rather than fetching N rows so the
  // payload is one number; the latest-year stamp comes back so the UI can
  // say "1990 → 2023" rather than guess.
  const rows = await sql/* sql */`
    SELECT
      COALESCE(SUM(co2_mt), 0)::float8 AS cum_mt,
      MAX(year)                        AS to_year,
      COUNT(*)::int                    AS years
      FROM country_emissions
     WHERE country_code = ${birthPlace.countryCode}
       AND year BETWEEN ${birthYear} AND 9999
  `;
  const r = rows[0];
  if (!r || Number(r.years) === 0) {
    return pendingCell(8, "country_emissions", "Your country's lifetime emissions");
  }
  const cumMt = Number(r.cum_mt);
  const toYear = Number(r.to_year);
  const cumGt = cumMt / 1000;       // Mt → Gt
  const primary = cumGt >= 1
    ? `${cumGt.toFixed(1)} Gt CO₂`
    : `${cumMt.toFixed(0)} Mt CO₂`;
  return {
    id: 8, kind: "country_emissions", status: "ok",
    label: "Your country's lifetime emissions",
    primary,
    detail: `${birthPlace.country} · ${birthYear} → ${toYear} · ${r.years} yrs`,
    data: { country: birthPlace.country, countryCode: birthPlace.countryCode,
            cumulativeCo2Mt: cumMt, fromYear: birthYear, toYear,
            yearsCovered: Number(r.years) },
    // validDays is a misnomer here (years, not days) but the ProvenancePill
    // already reads it. We only surface it when <360 so the pill reads "35"
    // — implicitly years for this cell. Refactor when we add a yearsCovered
    // field to Provenance.
    provenance: { source: "owid_gcb" },
  };
}

async function cellSeaLevel(birthYear: number): Promise<Cell> {
  // Delta in mm between birth year and the latest year we have. If the
  // birth year predates our reconstruction, anchor at the earliest row so
  // the cell still says something meaningful ("since 1880 …").
  const toYear = await latestYearFor("gmsl_mm");
  if (toYear === null) {
    return pendingCell(10, "sea_level", "Global sea level, your lifetime");
  }
  const rows = await sql/* sql */`
    WITH gi AS (
      SELECT year, value FROM global_indices WHERE indicator = 'gmsl_mm'
    ),
    b AS (
      SELECT year, value
        FROM gi
       WHERE year >= ${birthYear}
       ORDER BY year ASC
       LIMIT 1
    ),
    earliest AS (
      SELECT year, value FROM gi ORDER BY year ASC LIMIT 1
    )
    SELECT
      COALESCE((SELECT year  FROM b), (SELECT year  FROM earliest)) AS from_year,
      COALESCE((SELECT value FROM b), (SELECT value FROM earliest)) AS from_value,
      (SELECT value FROM gi WHERE year = ${toYear}) AS to_value
  `;
  const r = rows[0];
  if (!r || r.from_value === null || r.to_value === null) {
    return pendingCell(10, "sea_level", "Global sea level, your lifetime");
  }
  const deltaMm = Number(r.to_value) - Number(r.from_value);
  const fromYear = Number(r.from_year);
  const stamp = fromYear === birthYear
    ? `${birthYear} → ${toYear}`
    : `since records began · ${fromYear} → ${toYear}`;
  return {
    id: 10, kind: "sea_level", status: "ok",
    label: "Global sea level, your lifetime",
    primary: deltaMm >= 100
      ? `${fmtSigned(deltaMm / 10, 1, " cm")}`
      : `${fmtSigned(deltaMm, 0, " mm")}`,
    detail: stamp,
    data: { deltaMm, fromYear, toYear,
            fromValueMm: Number(r.from_value),
            toValueMm: Number(r.to_value) },
    provenance: { source: "csiro_nasa_gmsl" },
  };
}

async function cellCo2Ppm(birthYear: number): Promise<Cell> {
  // Mauna Loa starts 1959, so the birth-year row may be missing for older
  // visitors. We fall back to the earliest available year (1959) and stamp
  // the detail honestly.
  const toYear = await latestYearFor("co2_ppm");
  if (toYear === null) {
    return pendingCell(11, "co2_ppm", "CO₂ in the air: then vs now");
  }
  const rows = await sql/* sql */`
    WITH gi AS (
      SELECT year, value FROM global_indices WHERE indicator = 'co2_ppm'
    ),
    b AS (
      SELECT year, value
        FROM gi
       WHERE year >= ${birthYear}
       ORDER BY year ASC
       LIMIT 1
    ),
    earliest AS (
      SELECT year, value FROM gi ORDER BY year ASC LIMIT 1
    )
    SELECT
      COALESCE((SELECT year  FROM b), (SELECT year  FROM earliest)) AS from_year,
      COALESCE((SELECT value FROM b), (SELECT value FROM earliest)) AS from_value,
      (SELECT value FROM gi WHERE year = ${toYear}) AS to_value
  `;
  const r = rows[0];
  if (!r || r.from_value === null || r.to_value === null) {
    return pendingCell(11, "co2_ppm", "CO₂ in the air: then vs now");
  }
  const fromYear = Number(r.from_year);
  const fromVal = Number(r.from_value);
  const toVal = Number(r.to_value);
  const delta = toVal - fromVal;
  const stamp = fromYear === birthYear
    ? `${birthYear} → ${toYear}`
    : `Mauna Loa starts ${fromYear} · → ${toYear}`;
  return {
    id: 11, kind: "co2_ppm", status: "ok",
    label: "CO₂ in the air: then vs now",
    primary: `${fromVal.toFixed(0)} → ${toVal.toFixed(0)} ppm`,
    detail: `${stamp} · ${fmtSigned(delta, 0, " ppm")}`,
    data: { fromYear, toYear, fromPpm: fromVal, toPpm: toVal, deltaPpm: delta },
    provenance: { source: "noaa_gml_mlo" },
  };
}

async function cellProjection2050(birthPlace: Place): Promise<Cell> {
  const rows = await sql/* sql */`
    SELECT dt_c, dprecip_pct, baseline_start, baseline_end, source, notes
      FROM country_projections
     WHERE country_code = ${birthPlace.countryCode}
       AND scenario     = ${PROJECTION_SCENARIO}
       AND horizon      = ${PROJECTION_HORIZON}
     LIMIT 1
  `;
  const r = rows[0];
  if (!r) {
    return pendingCell(12, "projection_2050", "Your birthplace in 2050");
  }
  const dt = Number(r.dt_c);
  const dp = Number(r.dprecip_pct);
  const baseline = `${r.baseline_start}–${r.baseline_end}`;
  return {
    id: 12, kind: "projection_2050", status: "ok",
    label: "Your birthplace in 2050",
    primary: `${fmtSigned(dt, 1, "°C")} / ${fmtSigned(dp, 0, "% rain")}`,
    detail: `${birthPlace.country} · SSP2-4.5 mid · vs ${baseline} baseline`,
    data: { dtC: dt, dprecipPct: dp, scenario: PROJECTION_SCENARIO,
            horizon: PROJECTION_HORIZON, baselineStart: r.baseline_start,
            baselineEnd: r.baseline_end },
    provenance: { source: String(r.source) },
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

  const [
    byExtremes, latestBday, seasonal, rain,
    emissions, seaLevel, co2Ppm, projection,
  ] = await Promise.all([
    cellBirthYearExtremes(birthPlace, birthYear),
    cellLatestBirthdayExtremes(birthPlace, input.birthDate),
    cellsSeasonalRangeAcrossCities(stays),
    cellRainCompare(birthPlace, birthYear),
    cellCountryEmissions(birthPlace, birthYear),
    cellSeaLevel(birthYear),
    cellCo2Ppm(birthYear),
    cellProjection2050(birthPlace),
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
    emissions,
    rain,
    seaLevel,
    co2Ppm,
    projection,
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
