import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteCache } from "../src/cache/store.js";
import { Budget } from "../src/lib/budget.js";
import { createGeocoder } from "../src/resolvers/geocoding.js";
import { createGeocodeRoute } from "../src/routes/geocode.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempCache(): SqliteCache {
  const dir = mkdtempSync(join(tmpdir(), "klimate-geocode-"));
  tempDirs.push(dir);
  return new SqliteCache(join(dir, "cache.sqlite"));
}

describe("geocoder", () => {
  it("resolves aliases from prewarmed cities", async () => {
    const cache = tempCache();
    const geocoder = createGeocoder({
      cache,
      aliases: { bombay: "Mumbai" },
      prewarmCities: [
        {
          name: "Mumbai",
          displayName: "Mumbai (Bombay), Maharashtra, India",
          alternateNames: ["Bombay"],
          lat: 19.076,
          lon: 72.8777,
          country: "IN",
        },
      ],
    });

    await expect(geocoder.geocode("bombay")).resolves.toMatchObject([{ name: "Mumbai", source: "prewarm" }]);
    cache.close();
  });

  it("falls back to Open-Meteo and caches the transformed result", async () => {
    const cache = tempCache();
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          results: [
            {
              name: "Paris",
              latitude: 48.8566,
              longitude: 2.3522,
              country_code: "FR",
              country: "France",
              admin1: "Ile-de-France",
              alternate_names: ["Paris"],
            },
          ],
        }),
      );
    };
    const geocoder = createGeocoder({ cache, aliases: {}, prewarmCities: [], fetchImpl });

    const first = await geocoder.geocode("Paris", new Budget(3000));
    const second = await geocoder.geocode("Paris", new Budget(3000));

    expect(first).toEqual(second);
    expect(calls).toBe(1);
    expect(first[0]).toMatchObject({
      name: "Paris",
      displayName: "Paris, Ile-de-France, France",
      country: "FR",
      source: "open-meteo",
    });

    cache.close();
  });
});

describe("GET /geocode", () => {
  it("returns geocoder results", async () => {
    const route = createGeocodeRoute({
      geocode: async () => [
        {
          name: "New Delhi",
          displayName: "New Delhi, Delhi, India",
          lat: 28.6139,
          lon: 77.209,
          country: "IN",
          source: "prewarm",
        },
      ],
    });

    const res = await route.request("/?q=delhi");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ results: [{ name: "New Delhi" }] });
  });
});
