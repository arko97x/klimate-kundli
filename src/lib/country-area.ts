import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface CountryArea {
  name: string;
  km2: number;
}

// ISO 3166-1 alpha-2 code -> { name, km2 (total surface area incl. inland water) }.
// Source: World Bank indicator AG.SRF.TOTL.K2 (most recent non-empty value per country).
// Loaded from src/data like the static CSVs (tsc does not copy JSON into dist/).
function loadCountryAreas(dataDir = join(process.cwd(), "src", "data")): Record<string, CountryArea> {
  return JSON.parse(readFileSync(join(dataDir, "country_areas.json"), "utf8")) as Record<string, CountryArea>;
}

const COUNTRY_AREAS = loadCountryAreas();

/** Look up a country's surface area by ISO alpha-2 code (as produced by the geocoder). */
export function countryArea(code: string | undefined): CountryArea | null {
  if (!code) {
    return null;
  }
  return COUNTRY_AREAS[code.toUpperCase()] ?? null;
}
