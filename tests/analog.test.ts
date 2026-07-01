import { describe, expect, it } from "vitest";
import { createAnalogResolver, type AnalogIndex } from "../src/resolvers/analog.js";

// A tiny synthetic index: three cities on a vertical line. "Home" warmed over
// time so its childhood climate now matches the cooler city to its north.
function years(seed: [number, number, number], drift: number): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  for (let y = 1990; y <= 2024; y += 1) {
    const t = (y - 1990) / 34; // 0 → 1 across the range
    out[String(y)] = [seed[0] + drift * t, seed[1] + drift * t, seed[2]];
  }
  return out;
}

const index: AnalogIndex = {
  builtAt: "test",
  minSourceDays: 350,
  cities: [
    // Home: childhood ~35°C ceiling, warms to ~38°C today.
    { name: "Home", displayName: "Home City", lat: 20, lon: 78, country: "IN", grid: "20.0:78.0", years: years([35, 20, 1000], 3) },
    // North neighbour: cooler, today sits at ~35°C — matches Home's childhood.
    { name: "North", displayName: "North City", lat: 24, lon: 78, country: "IN", grid: "24.0:78.0", years: years([32, 17, 1000], 3) },
    // A far hotter city that should never match a cooler childhood.
    { name: "Hot", displayName: "Hot City", lat: 12, lon: 78, country: "IN", grid: "12.0:78.0", years: years([42, 28, 400], 2) },
  ],
};

const home = { name: "Home", displayName: "Home City", lat: 20, lon: 78 };

describe("createAnalogResolver", () => {
  it("finds where a childhood climate lives today", () => {
    const resolver = createAnalogResolver({ index });
    const { childhoodWindow, migrations } = resolver.resolve([home], 1990);

    expect(childhoodWindow).toEqual([1990, 1997]);
    expect(migrations).toHaveLength(1);
    expect(migrations[0].analog.name).toBe("North");
    expect(migrations[0].direction).toBe("north");
    expect(migrations[0].distanceKm).toBeGreaterThan(0);
  });

  it("reports the home's own then-vs-now drift", () => {
    const resolver = createAnalogResolver({ index });
    const [m] = resolver.resolve([home], 1990).migrations;

    // Childhood ceiling is cooler than today's — the home warmed.
    expect(m.childhood.heatCeiling).toBeLessThan(m.homeNow!.heatCeiling);
  });

  it("skips homes with no nearby indexed city instead of fetching", () => {
    const resolver = createAnalogResolver({ index, snapKm: 100 });
    const remote = { name: "Nowhere", displayName: "Nowhere", lat: -40, lon: 10 };
    expect(resolver.resolve([remote], 1990).migrations).toHaveLength(0);
  });

  it("dedupes lived cities that snap to the same grid cell", () => {
    const resolver = createAnalogResolver({ index });
    const near = { name: "HomeSuburb", displayName: "Home Suburb", lat: 20.05, lon: 78.02 };
    expect(resolver.resolve([home, near], 1990).migrations).toHaveLength(1);
  });

  it("returns empty when the childhood window has no data", () => {
    const resolver = createAnalogResolver({ index });
    expect(resolver.resolve([home], 1900).migrations).toHaveLength(0);
  });

  it("never returns the home itself as its own analog", () => {
    const resolver = createAnalogResolver({ index });
    const [m] = resolver.resolve([home], 1990).migrations;
    expect(m.analog.name).not.toBe("Home");
  });
});
