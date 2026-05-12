import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Cache } from "../cache/store.js";
import { Budget } from "../lib/budget.js";
import type { City } from "../types.js";

export interface GeocodeResult extends City {
  source: "prewarm" | "open-meteo" | "nominatim";
}

export interface Geocoder {
  geocode(query: string, budget?: Budget): Promise<GeocodeResult[]>;
}

interface GeocoderOptions {
  cache: Cache;
  prewarmCities?: City[];
  aliases?: Record<string, string>;
  fetchImpl?: typeof fetch;
  dataDir?: string;
}

interface OpenMeteoPlace {
  name?: string;
  latitude?: number;
  longitude?: number;
  country_code?: string;
  country?: string;
  admin1?: string;
  alternate_names?: string[];
}

interface NominatimPlace {
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

const GEOCODE_TTL_SEC = 30 * 24 * 60 * 60;

export function createGeocoder(options: GeocoderOptions): Geocoder {
  const fetchImpl = options.fetchImpl ?? fetch;
  const dataDir = options.dataDir ?? join(process.cwd(), "src", "data");
  const prewarmCities = options.prewarmCities ?? loadJson<City[]>(join(dataDir, "prewarm_cities.json"));
  const aliases = options.aliases ?? loadJson<Record<string, string>>(join(dataDir, "city_aliases.json"));

  return {
    async geocode(query: string, budget = new Budget(3000)): Promise<GeocodeResult[]> {
      const normalized = normalizeQuery(query);

      if (!normalized) {
        return [];
      }

      const cacheKey = `geocode:v1:${normalized}`;
      const cached = options.cache.get<GeocodeResult[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const prewarm = lookupPrewarm(normalized, prewarmCities);
      if (prewarm.length > 0) {
        options.cache.set(cacheKey, prewarm, GEOCODE_TTL_SEC);
        return prewarm;
      }

      const alias = aliases[normalized];
      if (alias) {
        const aliasMatch = lookupPrewarm(normalizeQuery(alias), prewarmCities);
        if (aliasMatch.length > 0) {
          options.cache.set(cacheKey, aliasMatch, GEOCODE_TTL_SEC);
          return aliasMatch;
        }
      }

      const openMeteo = await geocodeOpenMeteo(normalized, fetchImpl, budget);
      if (openMeteo.length > 0) {
        options.cache.set(cacheKey, openMeteo, GEOCODE_TTL_SEC);
        return openMeteo;
      }

      const nominatim = await geocodeNominatim(normalized, fetchImpl, budget);
      options.cache.set(cacheKey, nominatim, GEOCODE_TTL_SEC);
      return nominatim;
    },
  };
}

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function lookupPrewarm(normalized: string, cities: City[]): GeocodeResult[] {
  return cities
    .filter((city) => {
      const names = [city.name, city.displayName, ...(city.alternateNames ?? [])].map(normalizeQuery);
      return names.some((name) => name === normalized);
    })
    .map((city) => ({ ...city, source: "prewarm" as const }));
}

async function geocodeOpenMeteo(
  normalized: string,
  fetchImpl: typeof fetch,
  budget: Budget,
): Promise<GeocodeResult[]> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", normalized);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  try {
    const body = await fetchJsonWithRetry<{ results?: OpenMeteoPlace[] }>(url, fetchImpl, budget.signal(1500));
    return (body.results ?? []).flatMap(transformOpenMeteo);
  } catch {
    return [];
  }
}

async function geocodeNominatim(
  normalized: string,
  fetchImpl: typeof fetch,
  budget: Budget,
): Promise<GeocodeResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", normalized);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("accept-language", "en");
  url.searchParams.set("addressdetails", "1");

  try {
    const body = await fetchJsonWithRetry<NominatimPlace[]>(url, fetchImpl, budget.signal(1500), {
      "User-Agent": "KlimateKundli/1.0 (local-exhibit)",
    });
    return body.flatMap(transformNominatim);
  } catch {
    return [];
  }
}

function transformOpenMeteo(place: OpenMeteoPlace): GeocodeResult[] {
  if (!place.name || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude) || !place.country_code) {
    return [];
  }

  const name = place.name;
  const alternateNames = place.alternate_names?.filter((altName) => normalizeQuery(altName) !== normalizeQuery(name)) ?? [];

  return [
    {
      name,
      displayName: formatDisplayName(name, place.admin1, place.country ?? place.country_code, alternateNames),
      lat: Number(place.latitude),
      lon: Number(place.longitude),
      country: place.country_code.toUpperCase(),
      admin1: place.admin1,
      alternateNames,
      source: "open-meteo",
    },
  ];
}

function transformNominatim(place: NominatimPlace): GeocodeResult[] {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  const name = place.name ?? place.address?.city ?? place.address?.town ?? place.address?.village;
  const country = place.address?.country_code?.toUpperCase();

  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || !country) {
    return [];
  }

  const admin1 = place.address?.state;
  const countryName = place.address?.country ?? country;

  return [
    {
      name,
      displayName: formatDisplayName(name, admin1, countryName, []),
      lat,
      lon,
      country,
      admin1,
      alternateNames: [],
      source: "nominatim",
    },
  ];
}

function formatDisplayName(name: string, admin1: string | undefined, country: string, alternateNames: string[]): string {
  const alternate = alternateNames[0] ? ` (${alternateNames[0]})` : "";
  return [admin1, country]
    .filter((part): part is string => Boolean(part))
    .reduce((acc, part) => `${acc}, ${part}`, `${name}${alternate}`);
}

async function fetchJsonWithRetry<T>(
  url: URL,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  headers?: Record<string, string>,
): Promise<T> {
  try {
    return await fetchJson<T>(url, fetchImpl, signal, headers);
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    await delay(200, signal);
    return fetchJson<T>(url, fetchImpl, signal, headers);
  }
}

async function fetchJson<T>(
  url: URL,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetchImpl(url, { signal, headers });

  if (!res.ok) {
    throw new Error(`geocode fetch failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
