import type { StaticData, StaticLookup } from "../resolvers/statics.js";
import type { HistoricalWeatherResult, WeatherDaily } from "../resolvers/historical.js";
import type { ProjectionResult } from "../resolvers/projection.js";
import type { AnalogResolution } from "../resolvers/analog.js";
import type { City, Confidence, KundliCard, LivedCity, Source } from "../types.js";

export function buildYouCard(birthCity: City, birthDate: string): KundliCard {
  return {
    id: 1,
    type: "you",
    data: { city: birthCity.name, displayName: birthCity.displayName, born: birthDate },
    source: "input",
    confidence: "exact",
  };
}

export function buildBirthYearHighCard(
  birthCity: City,
  birthYear: number,
  weather: HistoricalWeatherResult | null,
): KundliCard {
  return buildExtremeCard({
    id: 2,
    type: "birth_year_high",
    city: birthCity,
    weather,
    year: birthYear < 1940 ? 1940 : birthYear,
    field: "tmax",
    mode: "max",
    forcedReason: birthYear < 1940 ? "pre-satellite-era" : undefined,
  });
}

export function buildBirthYearLowCard(
  birthCity: City,
  birthYear: number,
  weather: HistoricalWeatherResult | null,
): KundliCard {
  return buildExtremeCard({
    id: 3,
    type: "birth_year_low",
    city: birthCity,
    weather,
    year: birthYear < 1940 ? 1940 : birthYear,
    field: "tmin",
    mode: "min",
    forcedReason: birthYear < 1940 ? "pre-satellite-era" : undefined,
  });
}

export function buildLatestBirthdayHighCard(
  currentCity: City,
  birthDate: string,
  weather: HistoricalWeatherResult | null,
  today = new Date(),
): KundliCard {
  return buildBirthdayCard(4, "latest_birthday_high", currentCity, birthDate, weather, "tmax", today);
}

export function buildLatestBirthdayLowCard(
  currentCity: City,
  birthDate: string,
  weather: HistoricalWeatherResult | null,
  today = new Date(),
): KundliCard {
  return buildBirthdayCard(5, "latest_birthday_low", currentCity, birthDate, weather, "tmin", today);
}

export function buildSummerSpanCard(
  livedCities: LivedCity[],
  weatherByCity: Map<string, HistoricalWeatherResult | null>,
): KundliCard {
  return buildSeasonSpanCard(6, "summer_span", livedCities, weatherByCity, "tmax", "summer");
}

export function buildWinterSpanCard(
  livedCities: LivedCity[],
  weatherByCity: Map<string, HistoricalWeatherResult | null>,
): KundliCard {
  return buildSeasonSpanCard(7, "winter_span", livedCities, weatherByCity, "tmin", "winter");
}

export function buildRainfallChangeCard(
  birthCity: City,
  birthYear: number,
  weather: HistoricalWeatherResult | null,
): KundliCard {
  if (!weather) {
    return unavailableCard(
      9,
      "birth_city_rainfall_change",
      { city: birthCity.name, birthYear },
      "all-tiers-failed",
      "era5",
    );
  }

  const annual = annualPrecip(weather.daily);
  const years = [...annual.keys()].sort((a, b) => a - b);
  const latestYear = years.at(-1);

  if (latestYear === undefined) {
    return unavailableCard(9, "birth_city_rainfall_change", { city: birthCity.name, birthYear }, "no-data", weather.source);
  }

  const birthWindow = windowMean(annual, birthYear, birthYear + 9);
  const latestStart = latestYear - 9;
  const latestWindow = windowMean(annual, latestStart, latestYear);

  if (birthWindow === null || latestWindow === null) {
    return unavailableCard(
      9,
      "birth_city_rainfall_change",
      { city: birthCity.name, birthYear },
      "no-bracketing-years",
      weather.source,
    );
  }

  return {
    id: 9,
    type: "birth_city_rainfall_change",
    data: {
      city: birthCity.name,
      birthWindowStart: birthYear,
      latestWindowStart: latestStart,
      fromMmPerYear: birthWindow,
      toMmPerYear: latestWindow,
      percentChange: percentageChange(birthWindow, latestWindow),
    },
    source: weather.source,
    confidence: weather.confidence,
    reason: weather.reason,
  };
}

export function buildProjectedBirthdayCard(projection: ProjectionResult | null): KundliCard {
  if (!projection) {
    return unavailableCard(12, "projected_2050_birthday", {}, "all-tiers-failed", "cmip6");
  }

  return {
    id: 12,
    type: "projected_2050_birthday",
    data: {
      low: round(projection.low, 1),
      high: round(projection.high, 1),
      models_used: projection.modelsUsed,
    },
    source: projection.source,
    confidence: projection.confidence,
    reason: projection.reason,
  };
}

export function buildEmissionsChangeCard(
  statics: StaticData,
  birthCountry: string,
  currentCountry: string,
  birthYear: number,
): KundliCard {
  const latestYear = statics.latestEmissionsYear(currentCountry);

  if (latestYear === null) {
    return unavailableCard(8, "emissions_change", { birthCountry, currentCountry, birthYear }, "country-not-found");
  }

  const from = statics.lookupEmissions(birthCountry, birthYear);
  const to = statics.lookupEmissions(currentCountry, latestYear);

  return {
    id: 8,
    type: "emissions_change",
    data: {
      birthCountry,
      currentCountry,
      birthYear,
      latestYear,
      fromMt: finiteOrNull(from.value),
      toMt: finiteOrNull(to.value),
      percentChange: percentageChange(from.value, to.value),
    },
    source: "static_csv",
    confidence: combineConfidence(from, to),
    reason: combineReason(from, to),
  };
}

export function buildSeaLevelRiseCard(statics: StaticData, birthYear: number): KundliCard {
  const latestYear = statics.latestSeaLevelYear();

  if (latestYear === null) {
    return unavailableCard(10, "sea_level_rise", { birthYear }, "no-data");
  }

  const from = statics.lookupSeaLevel(birthYear);
  const to = statics.lookupSeaLevel(latestYear);

  return {
    id: 10,
    type: "sea_level_rise",
    data: {
      birthYear,
      latestYear,
      fromMm: finiteOrNull(from.value),
      toMm: finiteOrNull(to.value),
      deltaMm: Number.isFinite(from.value) && Number.isFinite(to.value) ? to.value - from.value : null,
    },
    source: "static_csv",
    confidence: combineConfidence(from, to),
    reason: combineReason(from, to),
  };
}

export function buildCo2PpmChangeCard(statics: StaticData, birthYear: number): KundliCard {
  const latestYear = statics.latestCo2Year();

  if (latestYear === null) {
    return unavailableCard(11, "co2_ppm_change", { birthYear }, "no-data");
  }

  const from = statics.lookupCo2Ppm(birthYear);
  const to = statics.lookupCo2Ppm(latestYear);

  return {
    id: 11,
    type: "co2_ppm_change",
    data: {
      birthYear,
      latestYear,
      fromPpm: finiteOrNull(from.value),
      toPpm: finiteOrNull(to.value),
      deltaPpm: Number.isFinite(from.value) && Number.isFinite(to.value) ? to.value - from.value : null,
    },
    source: "static_csv",
    confidence: combineConfidence(from, to),
    reason: combineReason(from, to),
  };
}

export function buildClimateMovedCard(resolution: AnalogResolution | null): KundliCard {
  if (!resolution || resolution.migrations.length === 0) {
    return unavailableCard(13, "climate_moved", {}, "no-analog", "climate_analog");
  }

  return {
    id: 13,
    type: "climate_moved",
    data: {
      childhoodWindow: resolution.childhoodWindow,
      migrations: resolution.migrations,
    },
    source: "climate_analog",
    confidence: lowestConfidence(resolution.migrations.map((m) => m.confidence)),
  };
}

const CONFIDENCE_RANK: Confidence[] = ["exact", "high", "medium", "low", "unavailable"];

function lowestConfidence(confidences: Confidence[]): Confidence {
  return confidences.reduce<Confidence>(
    (worst, current) => (CONFIDENCE_RANK.indexOf(current) > CONFIDENCE_RANK.indexOf(worst) ? current : worst),
    "high",
  );
}

function unavailableCard(
  id: number,
  type: string,
  data: Record<string, unknown>,
  reason: string,
  source: Source = "static_csv",
): KundliCard {
  return {
    id,
    type,
    data,
    source,
    confidence: "unavailable",
    reason,
  };
}

function percentageChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) {
    return null;
  }

  return ((to - from) / from) * 100;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function combineConfidence(...lookups: StaticLookup[]): Confidence {
  if (lookups.some((lookup) => lookup.confidence === "unavailable")) {
    return "unavailable";
  }

  if (lookups.some((lookup) => lookup.confidence === "low")) {
    return "low";
  }

  return "high";
}

function combineReason(...lookups: StaticLookup[]): string | undefined {
  const reasons = lookups.map((lookup) => lookup.reason).filter((reason): reason is string => Boolean(reason));
  return reasons.length > 0 ? [...new Set(reasons)].join(",") : undefined;
}

function buildExtremeCard(options: {
  id: number;
  type: string;
  city: City;
  weather: HistoricalWeatherResult | null;
  year: number;
  field: "tmax" | "tmin";
  mode: "max" | "min";
  forcedReason?: string;
}): KundliCard {
  if (!options.weather) {
    return unavailableCard(
      options.id,
      options.type,
      { city: options.city.name, year: options.year },
      "all-tiers-failed",
      "era5",
    );
  }

  const candidates = options.weather.daily
    .filter((day) => day.date.startsWith(`${options.year}-`))
    .flatMap((day) => {
      const value = day[options.field];
      return value === null ? [] : [{ date: day.date, value }];
    });

  if (candidates.length === 0) {
    return unavailableCard(
      options.id,
      options.type,
      { city: options.city.name, year: options.year },
      "no-data",
      options.weather.source,
    );
  }

  const best = candidates.reduce((current, candidate) =>
    options.mode === "max"
      ? candidate.value > current.value
        ? candidate
        : current
      : candidate.value < current.value
        ? candidate
        : current,
  );

  return {
    id: options.id,
    type: options.type,
    data: { value: best.value, unit: "°C", date: best.date, city: options.city.name },
    source: options.weather.source,
    confidence: options.forcedReason ? "low" : options.weather.confidence,
    reason: options.forcedReason ?? options.weather.reason,
  };
}

function buildBirthdayCard(
  id: number,
  type: string,
  currentCity: City,
  birthDate: string,
  weather: HistoricalWeatherResult | null,
  field: "tmax" | "tmin",
  today: Date,
): KundliCard {
  const date = latestPassedBirthday(birthDate, today);

  if (!weather) {
    return unavailableCard(id, type, { city: currentCity.name, date }, "all-tiers-failed", "era5");
  }

  const day = weather.daily.find((entry) => entry.date === date);
  const value = day?.[field] ?? null;

  if (value === null) {
    return unavailableCard(id, type, { city: currentCity.name, date }, "no-data", weather.source);
  }

  return {
    id,
    type,
    data: { value, unit: "°C", date, city: currentCity.name },
    source: weather.source,
    confidence: weather.confidence,
    reason: weather.reason,
  };
}

function buildSeasonSpanCard(
  id: number,
  type: string,
  livedCities: LivedCity[],
  weatherByCity: Map<string, HistoricalWeatherResult | null>,
  field: "tmax" | "tmin",
  season: "summer" | "winter",
): KundliCard {
  const values = livedCities.flatMap((city) => {
    const weather = weatherByCity.get(city.displayName);
    if (!weather) {
      return [];
    }

    const months = seasonMonths(city.lat, season);
    const meanValue = mean(
      weather.daily
        .filter((day) => months.includes(monthOf(day.date)))
        .flatMap((day) => (day[field] === null ? [] : [day[field]])),
    );

    return Number.isFinite(meanValue)
      ? [{ city: city.displayName, value: meanValue, source: weather.source, confidence: weather.confidence }]
      : [];
  });

  if (values.length === 0) {
    return unavailableCard(id, type, {}, "no-data", "era5");
  }

  const min = values.reduce((current, candidate) => (candidate.value < current.value ? candidate : current));
  const max = values.reduce((current, candidate) => (candidate.value > current.value ? candidate : current));

  return {
    id,
    type,
    data: {
      min: { city: min.city, value: round(min.value, 1) },
      max: { city: max.city, value: round(max.value, 1) },
      spanCelsius: round(max.value - min.value, 1),
    },
    source: max.source,
    confidence: values.some((value) => value.confidence === "low") ? "low" : max.confidence,
  };
}

function latestPassedBirthday(birthDate: string, today: Date): string {
  const monthDay = birthDate.slice(5);
  const currentYear = today.getUTCFullYear();
  const candidate = `${currentYear}-${monthDay}`;
  const todayIso = today.toISOString().slice(0, 10);
  return candidate <= todayIso ? candidate : `${currentYear - 1}-${monthDay}`;
}

function seasonMonths(lat: number, season: "summer" | "winter"): number[] {
  const northern = lat >= 0;
  if (season === "summer") {
    return northern ? [6, 7, 8] : [12, 1, 2];
  }
  return northern ? [12, 1, 2] : [6, 7, 8];
}

function annualPrecip(daily: WeatherDaily[]): Map<number, number> {
  const annual = new Map<number, number>();

  for (const day of daily) {
    if (day.precip === null) {
      continue;
    }
    const year = Number(day.date.slice(0, 4));
    annual.set(year, (annual.get(year) ?? 0) + day.precip);
  }

  return annual;
}

function windowMean(series: Map<number, number>, start: number, end: number): number | null {
  const values: number[] = [];
  for (let year = start; year <= end; year += 1) {
    const value = series.get(year);
    if (value !== undefined) {
      values.push(value);
    }
  }

  return values.length > 0 ? mean(values) : null;
}

function mean(values: number[]): number {
  return values.length === 0 ? Number.NaN : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}
