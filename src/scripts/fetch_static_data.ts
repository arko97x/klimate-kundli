import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCsv, toCsv } from "../lib/csv.js";

const DATA_DIR = join(process.cwd(), "src", "data");

const SOURCES = {
  emissions: "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv",
  seaLevel:
    "https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/slr/slr_sla_gbl_free_ref_90.csv",
  co2Ppm: "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.csv",
  // NSIDC Sea Ice Index v4.0 — Arctic September (summer-minimum) monthly-mean extent, million km^2.
  arcticIce: "https://noaadata.apps.nsidc.org/NOAA/G02135/north/monthly/data/N_09_extent_v4.0.csv",
} as const;

async function main(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tempDir = await mkdtemp(join(tmpdir(), "klimate-static-"));

  try {
    const [emissionsRaw, seaLevelRaw, co2Raw, arcticRaw] = await Promise.all([
      fetchText(SOURCES.emissions),
      fetchText(SOURCES.seaLevel),
      fetchText(SOURCES.co2Ppm),
      fetchText(SOURCES.arcticIce),
    ]);

    const outputs = [
      ["emissions.csv", cleanEmissions(emissionsRaw)],
      ["sea_level.csv", cleanSeaLevel(seaLevelRaw)],
      ["co2_ppm.csv", cleanCo2Ppm(co2Raw)],
      ["arctic_ice.csv", cleanArcticIce(arcticRaw)],
    ] as const;

    for (const [name, content] of outputs) {
      const tempPath = join(tempDir, name);
      const finalPath = join(DATA_DIR, name);
      await writeFile(tempPath, content, "utf8");
      await rename(tempPath, finalPath);
      console.log(JSON.stringify({ t: new Date().toISOString(), msg: "static_csv_written", file: finalPath }));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "KlimateKundli/1.0 (data refresh)",
    },
  });

  if (!res.ok) {
    throw new Error(`failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  return res.text();
}

function cleanEmissions(raw: string): string {
  const rows = parseCsv(raw)
    .map((row) => ({
      country: row.iso_code?.trim().toUpperCase(),
      year: Number(row.year),
      co2Mt: Number(row.co2),
    }))
    .filter((row) => row.country?.length === 3 && Number.isFinite(row.year) && Number.isFinite(row.co2Mt))
    .sort((a, b) => a.country.localeCompare(b.country) || a.year - b.year);

  if (rows.length < 10_000) {
    throw new Error(`emissions validation failed: ${rows.length} rows`);
  }

  return toCsv(
    ["country", "year", "co2_mt"],
    rows.map((row) => [row.country, row.year, round(row.co2Mt, 3)]),
  );
}

function cleanSeaLevel(raw: string): string {
  const grouped = new Map<number, number[]>();
  const rows = parseCsv(raw);

  for (const row of rows) {
    const decimalYear = Number(row.year);
    const value = firstFinite([
      row["TOPEX/Poseidon"],
      row["Jason-1"],
      row["Jason-2"],
      row["Jason-3"],
      row["Sentinel-6MF"],
    ]);

    if (!Number.isFinite(decimalYear) || value === null) {
      continue;
    }

    const year = Math.floor(decimalYear);
    grouped.set(year, [...(grouped.get(year) ?? []), value]);
  }

  const baseline = mean(grouped.get(1993) ?? []);
  if (!Number.isFinite(baseline)) {
    throw new Error("sea level validation failed: missing 1993 baseline");
  }

  const annual = [...grouped.entries()]
    .map(([year, values]) => [year, round(mean(values) - baseline, 1)] as const)
    .filter(([, value]) => Number.isFinite(value))
    .sort(([a], [b]) => a - b);

  if (annual.length < 25) {
    throw new Error(`sea level validation failed: ${annual.length} annual rows`);
  }

  return toCsv(["year", "mm"], annual.map(([year, value]) => [year, value]));
}

function cleanCo2Ppm(raw: string): string {
  const rows = parseCsv(raw)
    .map((row) => ({
      year: Number(row.year),
      ppm: Number(row.mean),
    }))
    .filter((row) => Number.isFinite(row.year) && Number.isFinite(row.ppm))
    .sort((a, b) => a.year - b.year);

  if (rows.length < 50) {
    throw new Error(`co2 ppm validation failed: ${rows.length} rows`);
  }

  return toCsv(
    ["year", "ppm"],
    rows.map((row) => [row.year, round(row.ppm, 2)]),
  );
}

function cleanArcticIce(raw: string): string {
  const rows = parseCsv(raw)
    .map((row) => ({
      year: Number(row.year),
      extent: Number(row.extent),
    }))
    .filter((row) => Number.isFinite(row.year) && Number.isFinite(row.extent) && row.extent > 0)
    .sort((a, b) => a.year - b.year);

  if (rows.length < 30) {
    throw new Error(`arctic ice validation failed: ${rows.length} rows`);
  }

  return toCsv(
    ["year", "extent_mkm2"],
    rows.map((row) => [row.year, round(row.extent, 2)]),
  );
}

function firstFinite(values: Array<string | undefined>): number | null {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return null;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
