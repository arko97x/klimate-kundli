import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCo2PpmChangeCard,
  buildEmissionsChangeCard,
  buildSeaLevelRiseCard,
} from "../src/aggregations/cards.js";
import { loadStaticData } from "../src/resolvers/statics.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "klimate-statics-"));
  tempDirs.push(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "emissions.csv"),
    ["country,year,co2_mt", "IND,1990,600", "IND,1993,677", "IND,2024,3193", "GBR,2024,302", ""].join(
      "\n",
    ),
  );
  writeFileSync(join(dir, "sea_level.csv"), ["year,mm", "1993,0", "2023,99", ""].join("\n"));
  writeFileSync(join(dir, "co2_ppm.csv"), ["year,ppm", "1993,357.2", "2025,427.4", ""].join("\n"));
  writeFileSync(join(dir, "arctic_ice.csv"), ["year,extent_mkm2", "1993,6.2", "2025,4.3", ""].join("\n"));
  return dir;
}

describe("static data loader", () => {
  it("loads CSVs and looks up exact values", () => {
    const statics = loadStaticData(fixtureDir());

    expect(statics.lookupEmissions("INd", 1993)).toEqual({ value: 677, confidence: "high" });
    expect(statics.lookupSeaLevel(2023)).toEqual({ value: 99, confidence: "high" });
    expect(statics.lookupCo2Ppm(2025)).toEqual({ value: 427.4, confidence: "high" });
  });

  it("interpolates and bounds missing years with low confidence", () => {
    const statics = loadStaticData(fixtureDir());

    expect(statics.lookupSeaLevel(2008)).toEqual({ value: 49.5, confidence: "low", reason: "interpolated" });
    expect(statics.lookupCo2Ppm(1900)).toEqual({
      value: 357.2,
      confidence: "low",
      reason: "before-data-start",
    });
  });
});

describe("static cards", () => {
  it("builds cards 8, 10, and 11 from static lookups", () => {
    const statics = loadStaticData(fixtureDir());
    const emissionsCard = buildEmissionsChangeCard(statics, "IND", "IND", 1993);

    expect(emissionsCard).toMatchObject({
      id: 8,
      type: "emissions_change",
      confidence: "high",
      data: {
        fromMt: 677,
        toMt: 3193,
      },
    });
    expect(emissionsCard.data.percentChange).toBeCloseTo(371.64);

    expect(buildSeaLevelRiseCard(statics, 1993)).toMatchObject({
      id: 10,
      type: "sea_level_rise",
      confidence: "high",
      data: { fromMm: 0, toMm: 99, deltaMm: 99 },
    });

    expect(buildCo2PpmChangeCard(statics, 1993)).toMatchObject({
      id: 11,
      type: "co2_ppm_change",
      confidence: "high",
      data: { fromPpm: 357.2, toPpm: 427.4, deltaPpm: 70.19999999999999 },
    });
  });
});
