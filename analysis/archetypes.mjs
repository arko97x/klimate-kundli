#!/usr/bin/env node
/**
 * Reproduces every number in ARCHETYPES.md from a dump of the `kundlis` table.
 *
 *   node analysis/archetypes.mjs <dump.json>          # full report
 *   node analysis/archetypes.mjs <dump.json> --csv    # per-person labels to stdout
 *
 * Expects a JSON array of rows with at least:
 *   slug, birth_city_display, birth_year, birth_city, lived_cities, result, created_at
 *
 * To produce that from Supabase:
 *   curl -s "$SUPABASE_URL/rest/v1/kundlis?select=*&limit=1000" \
 *     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
 *     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > dump.json
 * (PostgREST caps at 1000 rows/request; page with &offset= past that.)
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
const csvMode = process.argv.includes("--csv");
if (!path) {
  console.error("usage: node analysis/archetypes.mjs <dump.json> [--csv]");
  process.exit(1);
}
const rows = JSON.parse(readFileSync(path, "utf8"));

// ---------- tiny stats helpers ----------
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const vr = (a) => { const m = mean(a); return mean(a.map((x) => (x - m) ** 2)); };
const sd = (a) => Math.sqrt(vr(a)) || 1;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const num = (a) => a.filter((x) => typeof x === "number" && isFinite(x));
function corr(x, y) {
  const mx = mean(x), my = mean(y);
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return n / Math.sqrt(dx * dy);
}
function ols(x, y) {
  const mx = mean(x), my = mean(y);
  let n = 0, d = 0;
  for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); d += (x[i] - mx) ** 2; }
  return d ? n / d : 0;
}
function haversine(a, b) {
  const R = 6371, t = (x) => (x * Math.PI) / 180;
  const dLat = t(b.lat - a.lat), dLon = t(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- feature extraction ----------
// One row per person. Features are grouped by what they are ABOUT, which turns
// out to be the whole point: `place*` features are properties of a city, `traj*`
// features are properties of a life.
const F = rows.map((r) => {
  const res = r.result ?? {};
  const bw = res.birthWindow, rw = res.recentWindow, rf = res.rainfall ?? {};
  const lived = r.lived_cities ?? [];
  const f = {
    slug: r.slug,
    city: r.birth_city_display,
    cityShort: String(r.birth_city_display).split(",")[0],
    country: r.birth_city?.country,
    birthYear: r.birth_year,
    nCities: lived.length,
    createdAt: r.created_at,
  };

  // --- place features (hypothesis: city-determined) ---
  if (bw?.monthly && rw?.monthly) {
    f.placeTemp = mean(bw.monthly);
    f.tempNow = mean(rw.monthly);
    f.warm = f.tempNow - f.placeTemp;
    f.placeSeasonRange = Math.max(...bw.monthly) - Math.min(...bw.monthly);
    const dm = rw.monthly.map((v, i) => v - bw.monthly[i]);
    f.warmSummer = mean([dm[3], dm[4], dm[5]]);
    f.warmWinter = mean([dm[11], dm[0], dm[1]]);
    if (bw.monthlyMin && rw.monthlyMin && bw.monthlyMax && rw.monthlyMax) {
      f.asym = mean(rw.monthlyMin.map((v, i) => v - bw.monthlyMin[i]))
             - mean(rw.monthlyMax.map((v, i) => v - bw.monthlyMax[i]));
    }
  }
  if (rf.birthWindow && rf.recentWindow) {
    const pb = rf.birthWindow.monthly.reduce((s, x) => s + x, 0);
    const pn = rf.recentWindow.monthly.reduce((s, x) => s + x, 0);
    f.placeRain = pb;
    f.rainPct = pb ? (100 * (pn - pb)) / pb : null;
    f.monsoonPct = rf.monsoonPctChange;
    f.heavyDelta = rf.deltaDaysPerYear;
  }

  // --- trajectory features (hypothesis: person-determined) ---
  const tl = res.tempTimeline?.years;
  if (tl?.length >= 8) {
    f.livedTrend = ols(tl.map((t) => t.year), tl.map((t) => t.meanTempC)) * 10; // C/decade
    const seq = [...new Set(tl.map((t) => t.cityName))];
    const segTemp = (c) => mean(tl.filter((t) => t.cityName === c).map((t) => t.meanTempC));
    f.trajCities = seq.length;
    f.tempFirstCity = segTemp(seq[0]);
    f.tempLastCity = segTemp(seq[seq.length - 1]);
    f.shift = f.tempLastCity - f.tempFirstCity;
  }
  if (lived.length) {
    let d = 0;
    for (let i = 1; i < lived.length; i++) d += haversine(lived[i - 1], lived[i]);
    f.migDistKm = d;
    f.countries = new Set(lived.map((c) => c.country)).size;
  }
  return f;
});

// ---------- the classifier ----------
export const SHIFT_THRESHOLD_C = 2.0; // see ARCHETYPES.md "open questions"

function trajectoryClass(f) {
  if (!isFinite(f.shift)) return "unknown";
  if (f.trajCities === 1) return "rooted";      // NOTE: contaminated, see doc
  if (f.shift < -SHIFT_THRESHOLD_C) return "cooled";
  if (f.shift > SHIFT_THRESHOLD_C) return "heated";
  return "lateral";
}

// k-means on the place signature -> "inheritance" zones. Deterministic seeding so
// the partner gets identical clusters on the same dump.
function kmeans(X, k, iter = 100) {
  let C = [];
  for (let i = 0; i < k; i++) C.push([...X[(i * 7919 + 13) % X.length]]);
  let A = new Array(X.length).fill(0);
  for (let t = 0; t < iter; t++) {
    A = X.map((x) => {
      let best = 0, bd = Infinity;
      C.forEach((c, i) => {
        const d = c.reduce((s, v, j) => s + (v - x[j]) ** 2, 0);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    });
    C = C.map((prev, i) => {
      const mem = X.filter((_, j) => A[j] === i);
      return mem.length ? prev.map((_, j) => mean(mem.map((r) => r[j]))) : prev;
    });
  }
  return A;
}

const CLUSTER_COLS = ["placeTemp", "placeSeasonRange", "logRain"];
const D = F.filter((f) => isFinite(f.placeTemp) && isFinite(f.placeRain) && isFinite(f.placeSeasonRange));
D.forEach((f) => { f.logRain = Math.log10(f.placeRain + 1); });
const stats = Object.fromEntries(CLUSTER_COLS.map((c) => {
  const v = D.map((f) => f[c]);
  return [c, [mean(v), sd(v)]];
}));
const X = D.map((f) => CLUSTER_COLS.map((c) => (f[c] - stats[c][0]) / stats[c][1]));
const zone = kmeans(X, 5);
D.forEach((f, i) => { f.zone = zone[i]; f.traj = trajectoryClass(f); });

// Name the zones by their centroid character rather than by index, so the labels
// survive a re-run on a different dump.
const zoneNames = {};
[...new Set(zone)].forEach((z) => {
  const m = D.filter((f) => f.zone === z);
  const T = mean(m.map((f) => f.placeTemp));
  const S = mean(m.map((f) => f.placeSeasonRange));
  const R = mean(m.map((f) => f.placeRain));
  zoneNames[z] = T < 18 ? "temperate" : S > 15 ? "continental-dry" : R > 1600 ? "wet-coastal" : T < 25 ? "upland-equable" : "hot-moderate";
});
D.forEach((f) => { f.zoneName = zoneNames[f.zone]; });

if (csvMode) {
  const cols = ["slug", "cityShort", "birthYear", "nCities", "zoneName", "traj", "placeTemp", "placeSeasonRange", "placeRain", "warm", "livedTrend", "shift", "migDistKm"];
  console.log(cols.join(","));
  for (const f of D) {
    console.log(cols.map((c) => (typeof f[c] === "number" ? f[c].toFixed(2) : f[c] ?? "")).join(","));
  }
  process.exit(0);
}

// ---------- report ----------
const H = (s) => console.log("\n" + "=".repeat(72) + "\n" + s + "\n" + "=".repeat(72));

H("0. CORPUS");
console.log("rows:", F.length, " usable (have place features):", D.length);
const days = {};
F.forEach((f) => { const d = String(f.createdAt).slice(0, 10); days[d] = (days[d] || 0) + 1; });
console.log("date span:", Object.keys(days).sort()[0], "->", Object.keys(days).sort().pop());
console.log("busiest days:", Object.entries(days).sort((a, b) => b[1] - a[1]).slice(0, 5));
const cc = {};
F.forEach((f) => { cc[f.country] = (cc[f.country] || 0) + 1; });
console.log("birth countries:", Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 6));
console.log("distinct birth cities:", new Set(F.map((f) => f.city)).size);
const nc = {};
F.forEach((f) => { nc[f.nCities] = (nc[f.nCities] || 0) + 1; });
console.log("#cities entered:", Object.entries(nc).sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ":" + v).join(" "));
console.log("entered >1 city:", F.filter((f) => f.nCities > 1).length);

H("1. VARIANCE DECOMPOSITION — is a feature about the CITY or the PERSON?");
console.log("ICC = share of total variance that is BETWEEN cities.");
console.log("High ICC => the feature is a property of the place, and clustering on");
console.log("it just recovers geography. Computed over cities with >=5 people.\n");
const byCity = {};
D.forEach((f) => { (byCity[f.city] = byCity[f.city] || []).push(f); });
const bigCities = Object.entries(byCity).filter(([, v]) => v.length >= 5).sort((a, b) => b[1].length - a[1].length);
console.log(`${bigCities.length} cities with >=5 people, covering ${bigCities.reduce((s, [, v]) => s + v.length, 0)} people\n`);
console.log("feature".padEnd(20), "totalVar".padStart(10), "withinCity".padStart(11), "ICC".padStart(7));
for (const c of ["placeTemp", "placeSeasonRange", "heavyDelta", "warm", "warmSummer", "warmWinter", "rainPct", "monsoonPct", "asym"]) {
  const all = num(D.map((f) => f[c]));
  if (!all.length) continue;
  const tot = vr(all);
  let ws = 0, wn = 0;
  for (const [, arr] of bigCities) {
    const v = num(arr.map((f) => f[c]));
    if (v.length < 3) continue;
    ws += vr(v) * v.length; wn += v.length;
  }
  const within = ws / wn;
  console.log(c.padEnd(20), tot.toFixed(2).padStart(10), within.toFixed(2).padStart(11), ((1 - within / tot) * 100).toFixed(0).padStart(6) + "%");
}

console.log("\nIs the leftover (city-demeaned) variation explained by birth year?");
const resid = [];
for (const [, arr] of Object.entries(byCity)) {
  if (arr.length < 2) continue;
  const mw = mean(num(arr.map((f) => f.warm)));
  arr.forEach((f) => { if (isFinite(f.warm)) resid.push([f.birthYear, f.warm - mw]); });
}
console.log("  corr(birthYear, city-demeaned warming) =", corr(resid.map((r) => r[0]), resid.map((r) => r[1])).toFixed(3), `(n=${resid.length})`);
console.log("  -> if ~0, the personal residual is noise, not a generational signal.");

H("2. MIGRATION vs WARMING — which actually moved your climate?");
const trends = num(D.map((f) => f.livedTrend));
console.log("lived warming trend (C/decade, OLS over the whole lived timeline):");
console.log("  p10", q(trends, 0.1).toFixed(2), " med", q(trends, 0.5).toFixed(2), " p90", q(trends, 0.9).toFixed(2));
const movers = D.filter((f) => f.trajCities > 1 && isFinite(f.shift));
const shifts = movers.map((f) => Math.abs(f.shift));
console.log(`\nmovers: ${movers.length} of ${D.filter((f) => isFinite(f.shift)).length}`);
console.log("|temp of last city - first city| (C):");
console.log("  med", q(shifts, 0.5).toFixed(1), " p75", q(shifts, 0.75).toFixed(1), " p90", q(shifts, 0.9).toFixed(1), " max", Math.max(...shifts).toFixed(1));
console.log(`  movers shifted >2C by relocating: ${shifts.filter((s) => s > 2).length}/${movers.length}`);
console.log(`\n  RATIO: median relocation shift ${q(shifts, 0.5).toFixed(1)}C  vs  median warming ${q(trends, 0.5).toFixed(2)}C/decade`);

H("3. TWIN DEFINITIONS — which one is not degenerate?");
console.log("(a) SIMILAR CLIMATE: nearest neighbour in place-signature space");
let sameCity = 0, sameRegion = 0;
for (const a of D) {
  let best = null, bd = Infinity;
  for (const b of D) {
    if (b.slug === a.slug) continue;
    const d = ((a.placeTemp - b.placeTemp) / stats.placeTemp[1]) ** 2
            + ((a.placeSeasonRange - b.placeSeasonRange) / stats.placeSeasonRange[1]) ** 2
            + ((a.logRain - b.logRain) / stats.logRain[1]) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  if (best.city === a.city) sameCity++;
  if (best.city.split(",").slice(1).join() === a.city.split(",").slice(1).join()) sameRegion++;
}
console.log(`    twin is literally the SAME CITY: ${sameCity}/${D.length} (${((100 * sameCity) / D.length).toFixed(0)}%)`);
console.log(`    twin is the same state/region:   ${sameRegion}/${D.length} (${((100 * sameRegion) / D.length).toFixed(0)}%)`);
console.log("    -> degenerate: this just tells someone about their neighbours.");

console.log("\n(b) TEMPORAL ANALOG: A's birth climate ~= B's present climate");
let hits = 0, sameCityHits = 0, pairs = 0;
for (const a of D) for (const b of D) {
  if (a.slug === b.slug) continue;
  pairs++;
  if (Math.abs(a.placeTemp - b.tempNow) < 0.3 && Math.abs(a.placeSeasonRange - b.placeSeasonRange) < 1.5) {
    hits++;
    if (a.city === b.city) sameCityHits++;
  }
}
console.log(`    matching ordered pairs: ${hits} of ${pairs}`);
console.log(`    of those, same city (a genuine time-travel twin): ${sameCityHits}`);
const spread = Math.max(...D.map((f) => f.placeTemp)) - Math.min(...D.map((f) => f.placeTemp));
console.log(`    scale: mean |warming| ${mean(D.map((f) => Math.abs(f.warm))).toFixed(2)}C  vs  city spread ${spread.toFixed(1)}C`);
console.log("    -> warming is an order of magnitude below the between-city signal,");
console.log("       so 'analogs' are mostly just other cities at that temperature.");

console.log("\n(c) TRAJECTORY: how your lived climate moved");
const tdist = {};
D.forEach((f) => { tdist[f.traj] = (tdist[f.traj] || 0) + 1; });
console.log("    classes:", tdist);
console.log("\n    same birth city, different trajectories (the test that matters):");
for (const [city, arr] of bigCities.slice(0, 6)) {
  const d = {};
  arr.forEach((f) => { d[f.traj] = (d[f.traj] || 0) + 1; });
  console.log("     ", city.split(",")[0].padEnd(22), JSON.stringify(d));
}
console.log("    -> splits within a city => genuinely person-level. This is the axis.");

H("4. PROPOSED SCHEME: INHERITANCE x TRAJECTORY");
console.log("Inheritance = k-means(k=5) on [placeTemp, seasonRange, log rain]\n");
for (const z of [...new Set(zone)].sort()) {
  const m = D.filter((f) => f.zone === z);
  const cities = {};
  m.forEach((f) => { cities[f.cityShort] = (cities[f.cityShort] || 0) + 1; });
  console.log(` ${String(zoneNames[z]).padEnd(16)} n=${String(m.length).padStart(3)}`,
    `T=${mean(m.map((f) => f.placeTemp)).toFixed(1).padStart(5)}`,
    `seas=${mean(m.map((f) => f.placeSeasonRange)).toFixed(1).padStart(5)}`,
    `rain=${mean(m.map((f) => f.placeRain)).toFixed(0).padStart(4)}mm`,
    "|", Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => `${c}(${n})`).join(" "));
}
console.log("\nCross-tab (rows = inheritance, cols = trajectory):");
const trajOrder = ["rooted", "lateral", "cooled", "heated"];
console.log("".padEnd(18), trajOrder.map((t) => t.padStart(8)).join(""));
for (const z of [...new Set(zone)].sort()) {
  const m = D.filter((f) => f.zone === z);
  console.log(String(zoneNames[z]).padEnd(18), trajOrder.map((t) => String(m.filter((f) => f.traj === t).length).padStart(8)).join(""));
}
console.log("\nTwin relation = SAME trajectory, DIFFERENT inheritance.");
let twinable = 0;
for (const a of D) {
  if (D.some((b) => b.slug !== a.slug && b.traj === a.traj && b.zone !== a.zone)) twinable++;
}
console.log(`People with at least one valid twin under that rule: ${twinable}/${D.length}`);
