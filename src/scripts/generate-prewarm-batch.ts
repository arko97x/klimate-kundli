/**
 * Build an additional prewarm city list from GeoNames-derived population data.
 * Usage: npx tsx src/scripts/generate-prewarm-batch.ts [count] [output]
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import allCities from "all-the-cities";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json" with { type: "json" };
import type { City } from "../types.js";

countries.registerLocale(enLocale);

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

const CA_PROVINCES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick",
  NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories",
  NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec",
  SK: "Saskatchewan", YT: "Yukon",
};

const AU_STATES: Record<string, string> = {
  ACT: "Australian Capital Territory", NSW: "New South Wales", NT: "Northern Territory",
  QLD: "Queensland", SA: "South Australia", TAS: "Tasmania", VIC: "Victoria", WA: "Western Australia",
};

const IN_STATES: Record<string, string> = {
  AN: "Andaman and Nicobar", AP: "Andhra Pradesh", AR: "Arunachal Pradesh", AS: "Assam",
  BR: "Bihar", CH: "Chandigarh", CT: "Chhattisgarh", DH: "Dadra and Nagar Haveli",
  DL: "Delhi", GA: "Goa", GJ: "Gujarat", HP: "Himachal Pradesh", HR: "Haryana",
  JH: "Jharkhand", JK: "Jammu and Kashmir", KA: "Karnataka", KL: "Kerala",
  LA: "Ladakh", LD: "Lakshadweep", MH: "Maharashtra", ML: "Meghalaya", MN: "Manipur",
  MP: "Madhya Pradesh", MZ: "Mizoram", NL: "Nagaland", OR: "Odisha", PB: "Punjab",
  PY: "Puducherry", RJ: "Rajasthan", SK: "Sikkim", TG: "Telangana", TN: "Tamil Nadu",
  TR: "Tripura", UP: "Uttar Pradesh", UT: "Uttarakhand", WB: "West Bengal",
};

type GeoCity = (typeof allCities)[number];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function countryName(code: string): string {
  const overrides: Record<string, string> = {
    CN: "China",
    TR: "Turkey",
    US: "United States",
    GB: "United Kingdom",
    KR: "South Korea",
    RU: "Russia",
    VN: "Vietnam",
    BO: "Bolivia",
    VE: "Venezuela",
    TZ: "Tanzania",
    CD: "Democratic Republic of the Congo",
    CG: "Republic of the Congo",
    LA: "Laos",
    SY: "Syria",
    IR: "Iran",
    TW: "Taiwan",
    HK: "Hong Kong",
  };
  return overrides[code] ?? countries.getName(code, "en") ?? code;
}

function admin1Name(country: string, adminCode: string): string | undefined {
  if (country === "US") return US_STATES[adminCode];
  if (country === "CA") return CA_PROVINCES[adminCode];
  if (country === "AU") return AU_STATES[adminCode];
  if (country === "IN") return IN_STATES[adminCode];
  return undefined;
}

function tokens(s: string): string[] {
  return norm(s).split(/\s+/).filter((t) => t.length >= 3);
}

function namesOverlap(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length && tb.length && ta[0] === tb[0] && (ta.length === 1 || tb.length === 1)) return true;
  return false;
}

function near(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
  return Math.abs(lat1 - lat2) < 0.06 && Math.abs(lon1 - lon2) < 0.06;
}

function buildBlocked(existing: City[]): { names: Set<string>; cities: City[] } {
  const names = new Set<string>();
  for (const c of existing) {
    names.add(norm(c.name));
    for (const a of c.alternateNames ?? []) names.add(norm(a));
    const head = c.displayName.split(",")[0] ?? c.name;
    names.add(norm(head.replace(/\(.*?\)/g, "").trim()));
  }
  return { names, cities: existing };
}

function isBlocked(geo: GeoCity, blocked: ReturnType<typeof buildBlocked>, picked: City[]): boolean {
  const [lon, lat] = geo.loc.coordinates;
  const labels = [geo.name, ...(geo.altName ? geo.altName.split(",") : [])];

  for (const label of labels) {
    if (blocked.names.has(norm(label))) return true;
    for (const name of blocked.names) {
      if (namesOverlap(label, name)) return true;
    }
    for (const p of picked) {
      if (namesOverlap(label, p.name)) return true;
      for (const a of p.alternateNames ?? []) {
        if (namesOverlap(label, a)) return true;
      }
    }
  }

  for (const c of blocked.cities) {
    if (near(lat, lon, c.lat, c.lon)) return true;
  }
  for (const c of picked) {
    if (near(lat, lon, c.lat, c.lon)) return true;
  }

  return false;
}

function toCity(geo: GeoCity): City {
  const [lon, lat] = geo.loc.coordinates;
  const country = geo.country;
  const admin1 = admin1Name(country, geo.adminCode);
  const cn = countryName(country);
  const displayName = admin1 ? `${geo.name}, ${admin1}, ${cn}` : `${geo.name}, ${cn}`;
  const alternateNames = geo.altName
    ? [...new Set(geo.altName.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 4)
    : [];

  const city: City = {
    name: geo.name,
    displayName,
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    country,
  };
  if (admin1) city.admin1 = admin1;
  if (alternateNames.length > 0) city.alternateNames = alternateNames;
  return city;
}

function verifyNoOverlap(existing: City[], batch: City[]): string[] {
  const errors: string[] = [];
  for (const b of batch) {
    for (const e of [...existing, ...batch]) {
      if (e === b) continue;
      if (namesOverlap(b.name, e.name)) errors.push(`name: ${b.name} ~ ${e.name}`);
      if (near(b.lat, b.lon, e.lat, e.lon)) errors.push(`coords: ${b.name} ~ ${e.name}`);
    }
  }
  return [...new Set(errors)];
}

const count = Number(process.argv[2] ?? 500);
const output = process.argv[3] ?? join(process.cwd(), "src", "data", "prewarm_cities_global_500.json");
const existing = JSON.parse(
  readFileSync(join(process.cwd(), "src", "data", "prewarm_cities.json"), "utf8"),
) as City[];

const blocked = buildBlocked(existing);
const candidates = [...allCities]
  .filter((c) => c.population >= 75_000)
  .sort((a, b) => b.population - a.population);

const picked: City[] = [];
for (const geo of candidates) {
  if (isBlocked(geo, blocked, picked)) continue;
  picked.push(toCity(geo));
  if (picked.length >= count) break;
}

const errors = verifyNoOverlap(existing, picked);
if (errors.length > 0) {
  console.error("Overlap check failed:", errors.slice(0, 20));
  process.exit(1);
}

writeFileSync(output, `${JSON.stringify(picked, null, 2)}\n`);
console.log(JSON.stringify({
  output,
  count: picked.length,
  countries: new Set(picked.map((c) => c.country)).size,
  minPopulation: candidates.find((c) => c.name === picked.at(-1)?.name)?.population,
  top: picked.slice(0, 5).map((c) => c.displayName),
  tail: picked.slice(-3).map((c) => c.displayName),
}, null, 2));
