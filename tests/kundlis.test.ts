import { describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { InMemoryKundliStore } from "../src/storage/in-memory.js";
import type { City } from "../src/types.js";

const delhi: City = {
  name: "Delhi",
  displayName: "Delhi, India",
  lat: 28.6139,
  lon: 77.209,
  country: "IN",
};

const sampleResult = {
  city: delhi,
  birthYear: 1990,
  birthWindow: { startYear: 1988, endYear: 1992, monthly: [], monthlyMin: [], monthlyMax: [] },
  recentWindow: { startYear: 2020, endYear: 2024, monthly: [], monthlyMin: [], monthlyMax: [] },
  largestDelta: null,
  hottestYears: null,
  indiaEmissions: null,
  parentsIndiaEmissions: null,
  parentsBirthWindow: null,
  globalContext: null,
  rainfall: null,
  rainRings: null,
  source: "era5",
  confidence: "high",
};

describe("kundlis API", () => {
  it("saves and fetches by slug", async () => {
    const store = new InMemoryKundliStore();
    const app = createApp({ kundliStore: store });

    const saveRes = await app.request("/kundlis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        birthCity: delhi,
        birthYear: 1990,
        livedCities: [{ ...delhi, start: "1990-01-01", end: null }],
        result: sampleResult,
      }),
    });

    expect(saveRes.status).toBe(201);
    const saved = (await saveRes.json()) as { slug: string; birthCityDisplay: string };
    expect(saved.slug).toMatch(/^[a-z0-9]{10}$/);
    expect(saved.birthCityDisplay).toBe("Delhi, India");

    const getRes = await app.request(`/kundlis/${saved.slug}`);
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as { slug: string; result: typeof sampleResult };
    expect(fetched.slug).toBe(saved.slug);
    expect(fetched.result.birthYear).toBe(1990);
  });

  it("lists saved kundlis newest first", async () => {
    const store = new InMemoryKundliStore();
    const app = createApp({ kundliStore: store });

    for (const year of [1988, 1992]) {
      await app.request("/kundlis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthCity: delhi,
          birthYear: year,
          livedCities: [{ ...delhi, start: `${year}-01-01`, end: null }],
          result: { ...sampleResult, birthYear: year },
        }),
      });
    }

    const listRes = await app.request("/kundlis?limit=10");
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as { items: { birthYear: number }[] };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]?.birthYear).toBe(1992);
    expect(body.items[1]?.birthYear).toBe(1988);
  });

  it("returns 404 for unknown slug", async () => {
    const app = createApp({ kundliStore: new InMemoryKundliStore() });
    const res = await app.request("/kundlis/notavalid1");
    expect(res.status).toBe(404);
  });
});
