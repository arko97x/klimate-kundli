import { readFileSync } from "node:fs";
import { join } from "node:path";
import { haversineKm } from "../lib/haversine.js";
import type { Confidence } from "../types.js";

/**
 * "How your climate moved" — the temporal climate-analog resolver.
 *
 * Given a lived city and the visitor's childhood window, it finds where that
 * city's *childhood-era* climate lives *today*. Pure and in-memory: it reads
 * ONLY the shipped `analog_index.json` (built offline from the prewarmed cache).
 * It NEVER performs network I/O and never falls back to a live weather fetch,
 * so it cannot break or hit a rate limit on the request path.
 */

/** Per-year climate triple: [heatCeiling, coldFloor, wetness]. */
export type YearTriple = [number, number, number];

export interface AnalogIndexCity {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  country: string;
  admin1?: string;
  grid: string;
  years: Record<string, YearTriple>;
}

export interface AnalogIndex {
  builtAt: string;
  minSourceDays: number;
  cities: AnalogIndexCity[];
}

export interface Fingerprint {
  heatCeiling: number;
  coldFloor: number;
  wetness: number;
}

export interface Migration {
  home: { name: string; displayName: string; lat: number; lon: number };
  analog: { name: string; displayName: string; lat: number; lon: number; country: string; admin1?: string };
  distanceKm: number;
  bearingDeg: number;
  direction: string;
  childhood: Fingerprint & { startYear: number; endYear: number; yearsUsed: number };
  homeNow: Fingerprint | null;
  matchZ: number;
  confidence: Confidence;
}

export interface AnalogResolution {
  childhoodWindow: [number, number];
  migrations: Migration[];
}

export interface AnalogHome {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
}

interface AnalogOptions {
  index: AnalogIndex;
  /** Years of the "today" window used for candidate fingerprints. */
  presentSpan?: number;
  /** Max distance a home may be from an indexed grid cell before we skip it (no fetch fallback). */
  snapKm?: number;
  /** Analogs closer than this are treated as "didn't really move" and skipped as trivial. */
  minMoveKm?: number;
  /** Childhood window length in years from birth (age 0–N). */
  childhoodSpan?: number;
}

export function createAnalogResolver(options: AnalogOptions) {
  const { index } = options;
  const presentSpan = options.presentSpan ?? 10;
  const snapKm = options.snapKm ?? 100;
  const minMoveKm = options.minMoveKm ?? 50;
  const childhoodSpan = options.childhoodSpan ?? 15;

  // Precompute once: each city's present-day fingerprint + the z-score normalizer.
  const present = new Map<string, Fingerprint>();
  for (const city of index.cities) {
    const fp = windowFingerprint(city, ...latestSpan(city, presentSpan));
    if (fp.yearsUsed > 0) {
      present.set(city.grid, fp);
    }
  }
  const norm = buildNormalizer([...present.values()]);

  return {
    resolve(homes: AnalogHome[], birthYear: number): AnalogResolution {
      const childStart = birthYear;
      const childEnd = birthYear + childhoodSpan;
      const migrations: Migration[] = [];
      const seenGrids = new Set<string>();

      for (const home of homes) {
        const snapped = nearestCity(index.cities, home);
        if (!snapped || snapped.distanceKm > snapKm) {
          continue; // Not near any indexed city — skip rather than fetch. Guardrail.
        }
        if (seenGrids.has(snapped.city.grid)) {
          continue; // Two lived cities snap to the same grid — one arrow is enough.
        }
        seenGrids.add(snapped.city.grid);

        const childhood = windowFingerprint(snapped.city, childStart, childEnd);
        if (childhood.yearsUsed === 0) {
          continue;
        }

        const analog = nearestAnalog(snapped.city, childhood, present, norm, index.cities, minMoveKm);
        if (!analog) {
          continue;
        }

        const distanceKm = Math.round(haversineKm(home, analog.city));
        const bearingDeg = bearing(home, analog.city);
        const homeNow = present.get(snapped.city.grid) ?? null;

        migrations.push({
          home: { name: home.name, displayName: home.displayName, lat: home.lat, lon: home.lon },
          analog: {
            name: analog.city.name,
            displayName: analog.city.displayName,
            lat: analog.city.lat,
            lon: analog.city.lon,
            country: analog.city.country,
            admin1: analog.city.admin1,
          },
          distanceKm,
          bearingDeg,
          direction: compass(bearingDeg),
          childhood: {
            startYear: childStart,
            endYear: childEnd,
            heatCeiling: round(childhood.heatCeiling, 1),
            coldFloor: round(childhood.coldFloor, 1),
            wetness: Math.round(childhood.wetness),
            yearsUsed: childhood.yearsUsed,
          },
          homeNow: homeNow
            ? {
                heatCeiling: round(homeNow.heatCeiling, 1),
                coldFloor: round(homeNow.coldFloor, 1),
                wetness: Math.round(homeNow.wetness),
              }
            : null,
          matchZ: round(analog.matchZ, 2),
          confidence: gradeConfidence(analog.matchZ, snapped.distanceKm, childhood.yearsUsed, homeNow !== null),
        });
      }

      // Most-moved city first — the strongest story leads.
      migrations.sort((a, b) => b.distanceKm - a.distanceKm);

      return { childhoodWindow: [childStart, childEnd], migrations };
    },
  };
}

export function loadAnalogIndex(path?: string): AnalogIndex {
  const file = path ?? join(process.cwd(), "src", "data", "analog_index.json");
  return JSON.parse(readFileSync(file, "utf8")) as AnalogIndex;
}

// ---------------------------------------------------------------------------

interface WindowFingerprint extends Fingerprint {
  yearsUsed: number;
}

function windowFingerprint(city: AnalogIndexCity, start: number, end: number): WindowFingerprint {
  let h = 0;
  let c = 0;
  let w = 0;
  let n = 0;
  for (let y = start; y <= end; y += 1) {
    const t = city.years[String(y)];
    if (!t) continue;
    h += t[0];
    c += t[1];
    w += t[2];
    n += 1;
  }
  return n === 0
    ? { heatCeiling: 0, coldFloor: 0, wetness: 0, yearsUsed: 0 }
    : { heatCeiling: h / n, coldFloor: c / n, wetness: w / n, yearsUsed: n };
}

function latestSpan(city: AnalogIndexCity, span: number): [number, number] {
  const years = Object.keys(city.years).map(Number);
  const end = years.length ? Math.max(...years) : 0;
  return [end - span + 1, end];
}

interface Normalizer {
  sd: Fingerprint;
}

function buildNormalizer(fps: Fingerprint[]): Normalizer {
  if (fps.length === 0) {
    return { sd: { heatCeiling: 1, coldFloor: 1, wetness: 1 } };
  }
  const mean = { heatCeiling: 0, coldFloor: 0, wetness: 0 };
  for (const f of fps) {
    mean.heatCeiling += f.heatCeiling;
    mean.coldFloor += f.coldFloor;
    mean.wetness += f.wetness;
  }
  mean.heatCeiling /= fps.length;
  mean.coldFloor /= fps.length;
  mean.wetness /= fps.length;

  const v = { heatCeiling: 0, coldFloor: 0, wetness: 0 };
  for (const f of fps) {
    v.heatCeiling += (f.heatCeiling - mean.heatCeiling) ** 2;
    v.coldFloor += (f.coldFloor - mean.coldFloor) ** 2;
    v.wetness += (f.wetness - mean.wetness) ** 2;
  }
  return {
    sd: {
      heatCeiling: Math.sqrt(v.heatCeiling / fps.length) || 1,
      coldFloor: Math.sqrt(v.coldFloor / fps.length) || 1,
      wetness: Math.sqrt(v.wetness / fps.length) || 1,
    },
  };
}

function zDist(a: Fingerprint, b: Fingerprint, n: Normalizer): number {
  const dh = (a.heatCeiling - b.heatCeiling) / n.sd.heatCeiling;
  const dc = (a.coldFloor - b.coldFloor) / n.sd.coldFloor;
  const dw = (a.wetness - b.wetness) / n.sd.wetness;
  return Math.sqrt(dh * dh + dc * dc + dw * dw);
}

function nearestCity(
  cities: AnalogIndexCity[],
  home: { lat: number; lon: number },
): { city: AnalogIndexCity; distanceKm: number } | null {
  let best: { city: AnalogIndexCity; distanceKm: number } | null = null;
  for (const city of cities) {
    const distanceKm = haversineKm(home, city);
    if (!best || distanceKm < best.distanceKm) {
      best = { city, distanceKm };
    }
  }
  return best;
}

function nearestAnalog(
  home: AnalogIndexCity,
  childhood: Fingerprint,
  present: Map<string, Fingerprint>,
  norm: Normalizer,
  cities: AnalogIndexCity[],
  minMoveKm: number,
): { city: AnalogIndexCity; matchZ: number } | null {
  let best: { city: AnalogIndexCity; matchZ: number } | null = null;
  for (const cand of cities) {
    if (cand.grid === home.grid) continue;
    const fp = present.get(cand.grid);
    if (!fp) continue;
    if (haversineKm(home, cand) < minMoveKm) continue;
    const matchZ = zDist(childhood, fp, norm);
    if (!best || matchZ < best.matchZ) {
      best = { city: cand, matchZ };
    }
  }
  return best;
}

function gradeConfidence(matchZ: number, snapKm: number, yearsUsed: number, homeNowKnown: boolean): Confidence {
  let grade: Confidence = matchZ < 0.5 ? "high" : matchZ < 1.0 ? "medium" : "low";
  const shaky = snapKm > 60 || yearsUsed < 5 || !homeNowKnown;
  if (shaky) {
    grade = grade === "high" ? "medium" : "low";
  }
  return grade;
}

function bearing(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lon - from.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

function compass(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8];
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}
