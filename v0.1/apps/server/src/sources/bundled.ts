import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { DATA_DIR } from "../config.js";
import { db } from "../db.js";

// ----- NOAA Mauna Loa annual mean CO2 -----
// CSV format (post-header):
//   year, mean, unc
// Header lines start with '#'.

export function loadCo2Csv(filename = "co2_annmean_mlo.csv"): number {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
  const raw = fs.readFileSync(file, "utf8");

  const lines = raw.split("\n").filter((l) => l && !l.startsWith("#") && !l.startsWith('"'));
  // Some NOAA CSVs are space-separated, some comma. Detect.
  const sep = lines[0]?.includes(",") ? "," : /\s+/;

  const ins = db.prepare(`INSERT OR REPLACE INTO co2_annual (year, ppm) VALUES (?, ?)`);
  const tx = db.transaction((rows: Array<[number, number]>) => {
    for (const [y, p] of rows) ins.run(y, p);
  });

  const rows: Array<[number, number]> = [];
  for (const line of lines) {
    const parts = typeof sep === "string" ? line.split(sep) : line.trim().split(sep);
    if (parts.length < 2) continue;
    const year = Number(parts[0]);
    const ppm = Number(parts[1]);
    if (Number.isFinite(year) && Number.isFinite(ppm) && year > 1900) {
      rows.push([year, ppm]);
    }
  }
  tx(rows);
  return rows.length;
}

// ----- Our World in Data: owid-co2-data.csv -----
// We slice to country/year/co2/co2_per_capita for size.

export function loadEmissionsCsv(filename = "owid-co2-data.csv"): number {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
  const raw = fs.readFileSync(file, "utf8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Array<Record<string, string>>;

  const ins = db.prepare(`
    INSERT OR REPLACE INTO emissions_annual (country, iso_code, year, co2_mt, co2_per_cap)
    VALUES (?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((rows: typeof records) => {
    for (const r of rows) {
      const country = r.country;
      const year = Number(r.year);
      if (!country || !Number.isFinite(year)) continue;
      const co2 = r.co2 ? Number(r.co2) : null;
      const perCap = r.co2_per_capita ? Number(r.co2_per_capita) : null;
      ins.run(
        country,
        r.iso_code || null,
        year,
        Number.isFinite(co2 as number) ? co2 : null,
        Number.isFinite(perCap as number) ? perCap : null,
      );
    }
  });
  tx(records);
  return records.length;
}

// ----- Sea level CSV -----
// Supported formats (auto-detected by header):
//   (a) EPA/datasets compilation: Year, CSIRO Adjusted Sea Level (inches),
//       Lower/Upper Error, NOAA Adjusted Sea Level (inches; 1993+ only).
//       1880 → present. Inches → mm via × 25.4.
//   (b) Generic monthly: date (YYYY-MM-DD), gmsl_mm.
//   (c) Generic annual: year, gmsl_mm.

const INCH_TO_MM = 25.4;

export function loadSeaLevelCsv(filename = "sea_level.csv"): number {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
  const raw = fs.readFileSync(file, "utf8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Array<Record<string, string>>;

  const ins = db.prepare(`
    INSERT OR REPLACE INTO sea_level_monthly (date, gmsl_mm, source) VALUES (?, ?, ?)
  `);

  let inserted = 0;
  const tx = db.transaction((rows: typeof records) => {
    for (const r of rows) {
      const dateField = r.date ?? r.Date;
      const yearField = r.year ?? r.Year;
      const epaCsiroInches = r["CSIRO Adjusted Sea Level"];
      const epaNoaaInches = r["NOAA Adjusted Sea Level"];

      // (a) EPA format: prefer NOAA altimetry value when present, else CSIRO.
      if (yearField && (epaCsiroInches !== undefined || epaNoaaInches !== undefined)) {
        const y = Number(yearField);
        if (!Number.isFinite(y)) continue;
        const noaa = epaNoaaInches !== undefined && epaNoaaInches !== "" ? Number(epaNoaaInches) : NaN;
        const csiro = epaCsiroInches !== undefined && epaCsiroInches !== "" ? Number(epaCsiroInches) : NaN;
        const inches = Number.isFinite(noaa) ? noaa : csiro;
        if (!Number.isFinite(inches)) continue;
        const dateKey = `${Math.floor(y)}-06-15`;
        const source = Number.isFinite(noaa) ? "noaa-altimetry" : "csiro-recon";
        ins.run(dateKey, inches * INCH_TO_MM, source);
        inserted++;
        continue;
      }

      // (b)/(c) generic.
      const gmsl = Number(r.gmsl_mm ?? r.GMSL ?? r.gmsl ?? r.value);
      if (!Number.isFinite(gmsl)) continue;
      let dateKey: string | null = null;
      let source = "unknown";
      if (dateField) {
        dateKey = dateField.length === 10 ? dateField : `${dateField}-15`;
        source = "nasa-altimetry";
      } else if (yearField) {
        const y = Number(yearField);
        if (!Number.isFinite(y)) continue;
        dateKey = `${Math.floor(y)}-06-15`;
        source = "csiro-gauge";
      }
      if (!dateKey) continue;
      ins.run(dateKey, gmsl, source);
      inserted++;
    }
  });
  tx(records);
  return inserted;
}

// ----- Lookup helpers used by compute layer -----

export function getCo2PpmForYear(year: number): number | null {
  const row = db
    .prepare<[number], { ppm: number }>(`SELECT ppm FROM co2_annual WHERE year = ?`)
    .get(year);
  return row?.ppm ?? null;
}

export function getLatestCo2Ppm(): { year: number; ppm: number } | null {
  return (
    db
      .prepare<[], { year: number; ppm: number }>(
        `SELECT year, ppm FROM co2_annual ORDER BY year DESC LIMIT 1`,
      )
      .get() ?? null
  );
}

export function getEmissionsForYear(country: string, year: number): number | null {
  const row = db
    .prepare<[string, number], { co2_mt: number | null }>(
      `SELECT co2_mt FROM emissions_annual WHERE country = ? AND year = ?`,
    )
    .get(country, year);
  return row?.co2_mt ?? null;
}

export function getLatestEmissions(country: string): { year: number; co2_mt: number } | null {
  return (
    db
      .prepare<[string], { year: number; co2_mt: number }>(
        `SELECT year, co2_mt FROM emissions_annual
         WHERE country = ? AND co2_mt IS NOT NULL
         ORDER BY year DESC LIMIT 1`,
      )
      .get(country) ?? null
  );
}

// ISO-code lookups. Bypasses country-name aliasing entirely. iso3 = ISO 3166-1
// alpha-3, e.g. "IND", "USA". Returns the canonical OWID country name when
// found so the UI can display the matched label.
export function getEmissionsByIsoForYear(
  iso3: string,
  year: number,
): { country: string; co2_mt: number } | null {
  return (
    db
      .prepare<[string, number], { country: string; co2_mt: number }>(
        `SELECT country, co2_mt FROM emissions_annual
         WHERE iso_code = ? AND year = ? AND co2_mt IS NOT NULL`,
      )
      .get(iso3, year) ?? null
  );
}

export function getLatestEmissionsByIso(
  iso3: string,
): { country: string; year: number; co2_mt: number } | null {
  return (
    db
      .prepare<[string], { country: string; year: number; co2_mt: number }>(
        `SELECT country, year, co2_mt FROM emissions_annual
         WHERE iso_code = ? AND co2_mt IS NOT NULL
         ORDER BY year DESC LIMIT 1`,
      )
      .get(iso3) ?? null
  );
}

export function getSeaLevelForYear(year: number): { date: string; gmsl_mm: number } | null {
  return (
    db
      .prepare<[string, string, string], { date: string; gmsl_mm: number }>(
        `SELECT date, gmsl_mm FROM sea_level_monthly
         WHERE date BETWEEN ? AND ?
         ORDER BY ABS(julianday(date) - julianday(? || '-06-15')) LIMIT 1`,
      )
      .get(`${year}-01-01`, `${year}-12-31`, String(year)) ?? null
  );
}

export function getLatestSeaLevel(): { date: string; gmsl_mm: number } | null {
  return (
    db
      .prepare<[], { date: string; gmsl_mm: number }>(
        `SELECT date, gmsl_mm FROM sea_level_monthly ORDER BY date DESC LIMIT 1`,
      )
      .get() ?? null
  );
}
