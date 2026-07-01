import { Hono } from "hono";
import { z } from "zod";
import type { Cache } from "../cache/store.js";
import {
  buildBirthYearHighCard,
  buildBirthYearLowCard,
  buildClimateMovedCard,
  buildCo2PpmChangeCard,
  buildEmissionsChangeCard,
  buildLatestBirthdayHighCard,
  buildLatestBirthdayLowCard,
  buildProjectedBirthdayCard,
  buildRainfallChangeCard,
  buildSeaLevelRiseCard,
  buildSummerSpanCard,
  buildWinterSpanCard,
  buildYouCard,
} from "../aggregations/cards.js";
import { Budget } from "../lib/budget.js";
import type { Telemetry } from "../lib/telemetry.js";
import type { AnalogHome, AnalogResolution } from "../resolvers/analog.js";
import type { HistoricalWeatherResult } from "../resolvers/historical.js";
import type { ProjectionResult } from "../resolvers/projection.js";
import type { StaticData } from "../resolvers/statics.js";
import type { City, KundliCard, LivedCity } from "../types.js";

interface KundliRouteDeps {
  cache: Cache;
  statics: StaticData;
  telemetry: Telemetry;
  historical: {
    resolve(city: City, startDate: string, endDate: string, budget?: Budget): Promise<HistoricalWeatherResult | null>;
  };
  projection: {
    resolve(
      city: City,
      birthDate: string,
      historical: HistoricalWeatherResult | null,
      budget?: Budget,
    ): Promise<ProjectionResult | null>;
  };
  analog: {
    resolve(homes: AnalogHome[], birthYear: number): AnalogResolution;
  };
  today?: Date;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const citySchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  country: z.string().min(2).max(3),
  admin1: z.string().optional(),
  alternateNames: z.array(z.string()).optional(),
});

const livedCitySchema = citySchema.extend({
  start: dateSchema,
  end: dateSchema.nullable(),
});

const kundliInputSchema = z
  .object({
    birthDate: dateSchema,
    birthCity: citySchema,
    livedCities: z.array(livedCitySchema).min(1),
  })
  .refine((value) => value.livedCities.filter((city) => city.end === null).length === 1, {
    message: "Exactly one lived city must have end: null",
    path: ["livedCities"],
  });

export function createKundliRoute(deps: KundliRouteDeps): Hono {
  const route = new Hono();

  route.post("/", async (c) => {
    const parsed = kundliInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ issues: parsed.error.issues }, 400);
    }

    const startMs = Date.now();
    const beforeStats = deps.cache.stats();
    const budget = new Budget(8000);
    const today = deps.today ?? new Date();
    const todayIso = isoDate(today);

    try {
      const input = parsed.data;
      const birthYear = Number(input.birthDate.slice(0, 4));
      const currentCity = input.livedCities.find((city) => city.end === null) as LivedCity;
      const latestBirthday = latestPassedBirthday(input.birthDate, today);
      const latestCompleteYear = today.getUTCFullYear() - 1;
      const birthStartYear = Math.max(1940, birthYear);

      const birthWeatherPromise = deps.historical.resolve(
        input.birthCity,
        `${birthStartYear}-01-01`,
        `${latestCompleteYear}-12-31`,
        budget,
      );
      const currentBirthdayWeatherPromise = deps.historical.resolve(currentCity, latestBirthday, latestBirthday, budget);
      const livedWeatherEntriesPromise = Promise.all(
        input.livedCities.map(async (city) => {
          const result = await deps.historical.resolve(city, city.start, city.end ?? todayIso, budget);
          return [city.displayName, result] as const;
        }),
      );

      const [birthWeather, currentBirthdayWeather, livedWeatherEntries] = await Promise.all([
        birthWeatherPromise,
        currentBirthdayWeatherPromise,
        livedWeatherEntriesPromise,
      ]);
      const projection = await deps.projection.resolve(currentCity, input.birthDate, currentBirthdayWeather ?? birthWeather, budget);
      const weatherByCity = new Map<string, HistoricalWeatherResult | null>(livedWeatherEntries);

      // Pure in-memory analog match over the shipped index — never fetches.
      const climateMoved = deps.analog.resolve(input.livedCities, birthYear);

      const cards: KundliCard[] = [
        buildYouCard(input.birthCity, input.birthDate),
        buildBirthYearHighCard(input.birthCity, birthYear, birthWeather),
        buildBirthYearLowCard(input.birthCity, birthYear, birthWeather),
        buildLatestBirthdayHighCard(currentCity, input.birthDate, currentBirthdayWeather, today),
        buildLatestBirthdayLowCard(currentCity, input.birthDate, currentBirthdayWeather, today),
        buildSummerSpanCard(input.livedCities, weatherByCity),
        buildWinterSpanCard(input.livedCities, weatherByCity),
        buildEmissionsChangeCard(deps.statics, input.birthCity.country, currentCity.country, birthYear),
        buildRainfallChangeCard(input.birthCity, birthYear, birthWeather),
        buildSeaLevelRiseCard(deps.statics, birthYear),
        buildCo2PpmChangeCard(deps.statics, birthYear),
        buildProjectedBirthdayCard(projection),
        buildClimateMovedCard(climateMoved),
      ];

      const afterStats = deps.cache.stats();
      const partial = budget.expired() || cards.some((card) => card.confidence === "low" || card.confidence === "unavailable");
      const fallbacksFired = cards.flatMap((card) => (card.reason ? [`${card.type}:${card.reason}`] : []));
      const totalMs = Date.now() - startMs;

      deps.telemetry.recordKundli({
        ms: totalMs,
        fallbacks: fallbacksFired,
        cacheHits: afterStats.hits - beforeStats.hits,
        cacheMisses: afterStats.misses - beforeStats.misses,
        partial,
      });

      return c.json({
        kundli: { cards },
        telemetry: {
          totalMs,
          fallbacksFired,
          cacheHits: afterStats.hits - beforeStats.hits,
          cacheMisses: afterStats.misses - beforeStats.misses,
          partial,
        },
      });
    } catch (error) {
      console.error(JSON.stringify({ t: new Date().toISOString(), endpoint: "/kundli", error: String(error) }));
      return c.json({
        kundli: { cards: [] },
        telemetry: {
          totalMs: Date.now() - startMs,
          fallbacksFired: ["handler:unexpected-error"],
          cacheHits: 0,
          cacheMisses: 0,
          partial: true,
        },
      });
    } finally {
      budget.cancel();
    }
  });

  return route;
}

function latestPassedBirthday(birthDate: string, today: Date): string {
  const monthDay = birthDate.slice(5);
  const currentYear = today.getUTCFullYear();
  const candidate = `${currentYear}-${monthDay}`;
  return candidate <= isoDate(today) ? candidate : `${currentYear - 1}-${monthDay}`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
