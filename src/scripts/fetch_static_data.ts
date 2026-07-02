import { access, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
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
  oceanTemp: `https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/global/time-series/globe/tavg/ocean/12/12/1880-${new Date().getFullYear()}/data.csv`,
} as const;

async function main(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tempDir = await mkdtemp(join(tmpdir(), "klimate-static-"));

  const processOrFallback = async (
    key: keyof typeof SOURCES,
    filename: string,
    cleanFn: (raw: string) => string,
  ): Promise<void> => {
    try {
      const url = SOURCES[key];
      console.log(JSON.stringify({ t: new Date().toISOString(), msg: "fetching_static_data", key, url }));
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "KlimateKundli/1.0 (data refresh)",
        },
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`status ${res.status} ${res.statusText}`);
      }
      const rawText = await res.text();
      const cleaned = cleanFn(rawText);
      const tempPath = join(tempDir, filename);
      const finalPath = join(DATA_DIR, filename);
      await writeFile(tempPath, cleaned, "utf8");
      await rename(tempPath, finalPath);
      console.log(JSON.stringify({ t: new Date().toISOString(), msg: "static_csv_written", file: finalPath }));
    } catch (err) {
      console.warn(
        JSON.stringify({
          t: new Date().toISOString(),
          level: "WARN",
          msg: "fetch_failed_keeping_existing_local",
          key,
          error: String(err),
        }),
      );
      try {
        await access(join(DATA_DIR, filename));
      } catch (accessErr) {
        throw new Error(`Failed to fetch ${key} and no local file exists: ${String(err)}`);
      }
    }
  };

  try {
    await Promise.all([
      processOrFallback("emissions", "emissions.csv", cleanEmissions),
      processOrFallback("seaLevel", "sea_level.csv", cleanSeaLevel),
      processOrFallback("co2Ppm", "co2_ppm.csv", cleanCo2Ppm),
      processOrFallback("arcticIce", "arctic_ice.csv", cleanArcticIce),
      processOrFallback("oceanTemp", "ocean_temp.csv", cleanOceanTemp),
    ]);
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
  const parseVal = (val: string | undefined): number => {
    if (!val || val.trim() === "") return 0;
    const num = Number(val);
    return Number.isFinite(num) ? num : 0;
  };

  const rows = parseCsv(raw)
    .map((row) => ({
      country: row.iso_code?.trim().toUpperCase(),
      year: Number(row.year),
      co2Mt: Number(row.co2),
      coalMt: parseVal(row.coal_co2),
      oilMt: parseVal(row.oil_co2),
      cementMt: parseVal(row.cement_co2),
      gasMt: parseVal(row.gas_co2),
      flaringMt: parseVal(row.flaring_co2),
    }))
    .filter((row) => row.country?.length === 3 && Number.isFinite(row.year) && Number.isFinite(row.co2Mt))
    .sort((a, b) => a.country.localeCompare(b.country) || a.year - b.year);

  if (rows.length < 10_000) {
    throw new Error(`emissions validation failed: ${rows.length} rows`);
  }

  return toCsv(
    ["country", "year", "co2_mt", "coal_mt", "oil_mt", "cement_mt", "gas_mt", "flaring_mt"],
    rows.map((row) => [
      row.country,
      row.year,
      round(row.co2Mt, 3),
      round(row.coalMt, 3),
      round(row.oilMt, 3),
      round(row.cementMt, 3),
      round(row.gasMt, 3),
      round(row.flaringMt, 3),
    ]),
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

function cleanOceanTemp(raw: string): string {
  const rows = parseCsv(raw)
    .map((row) => {
      const yearKey = Object.keys(row).find((k) => k.toLowerCase() === "year") || "Year";
      const anomalyKey = Object.keys(row).find((k) => k.toLowerCase().includes("departure")) || "Departure from Average";
      return {
        year: Number(row[yearKey]),
        anomaly: Number(row[anomalyKey]),
      };
    })
    .filter((row) => Number.isFinite(row.year) && Number.isFinite(row.anomaly))
    .sort((a, b) => a.year - b.year);

  if (rows.length < 100) {
    throw new Error(`ocean temp validation failed: ${rows.length} rows`);
  }

  return toCsv(
    ["year", "anomaly_c"],
    rows.map((row) => [row.year, round(row.anomaly, 2)]),
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
