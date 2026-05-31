import { describe, expect, it } from "vitest";

import { bindNearestStation } from "../src/resolvers/imd/stations.js";
import type { ImdStationMapFile } from "../src/resolvers/imd/types.js";

const map: ImdStationMapFile = {
  updatedAt: "2026-01-01",
  stations: [
    { id: "delhi", name: "Delhi", lat: 28.6, lon: 77.2 },
    { id: "mumbai", name: "Mumbai", lat: 19.0, lon: 72.8 },
  ],
};

describe("bindNearestStation", () => {
  it("returns null outside India", () => {
    expect(bindNearestStation({ lat: 51.5, lon: -0.1, country: "GB" }, map)).toBeNull();
  });

  it("picks nearest station within radius", () => {
    const binding = bindNearestStation({ lat: 28.55, lon: 77.1, country: "IN" }, map);
    expect(binding?.station.id).toBe("delhi");
    expect(binding?.distanceKm).toBeLessThan(20);
  });

  it("returns null when all stations too far", () => {
    expect(bindNearestStation({ lat: 8.5, lon: 76.9, country: "IN" }, map, 50)).toBeNull();
  });
});
