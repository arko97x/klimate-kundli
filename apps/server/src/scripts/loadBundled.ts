import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../config.js";
import { closeDb } from "../db.js";
import { loadCo2Csv, loadEmissionsCsv, loadSeaLevelCsv } from "../sources/bundled.js";

function exists(name: string): boolean {
  return fs.existsSync(path.join(DATA_DIR, name));
}

console.log(`loading bundled CSVs from ${DATA_DIR}`);

if (exists("co2_annmean_mlo.csv")) {
  const n = loadCo2Csv("co2_annmean_mlo.csv");
  console.log(`  co2_annual: ${n} rows`);
} else {
  console.log("  skip co2_annmean_mlo.csv (not found)");
}

if (exists("owid-co2-data.csv")) {
  const n = loadEmissionsCsv("owid-co2-data.csv");
  console.log(`  emissions_annual: ${n} rows`);
} else {
  console.log("  skip owid-co2-data.csv (not found)");
}

if (exists("sea_level.csv")) {
  const n = loadSeaLevelCsv("sea_level.csv");
  console.log(`  sea_level_monthly: ${n} rows`);
} else {
  console.log("  skip sea_level.csv (not found)");
}

closeDb();
