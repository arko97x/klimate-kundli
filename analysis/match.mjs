#!/usr/bin/env node
/**
 * The connect rule from CONFERENCE-DESIGN.md §1, actually run on the corpus.
 *
 *   node analysis/match.mjs <dump.json>              # worked examples + corpus highlights
 *   node analysis/match.mjs <dump.json> --slug <s>   # top-3 connections for one person
 *
 * Scoring: for a pair, compute 7 gap dimensions, convert each to its percentile
 * against every pair in the corpus, and take the MAX as the pair's score.
 * Surfacing: top candidate, then exclude its winning dimension and re-rank, x3.
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) { console.error("usage: node analysis/match.mjs <dump.json> [--slug <slug>]"); process.exit(1); }
const si = process.argv.indexOf("--slug");
const ONLY = si > -1 ? process.argv[si + 1] : null;
const rows = JSON.parse(readFileSync(path, "utf8"));

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) || 1; };

// ---------- people ----------
const P = [];
for (const r of rows) {
  const tl = r.result?.tempTimeline?.years;
  const bw = r.result?.birthWindow;
  const rf = r.result?.rainfall;
  if (!tl || tl.length < 8 || !bw?.monthly || !rf?.birthWindow) continue;
  const seq = [...new Set(tl.map((t) => t.cityName))];
  const segTemp = (c) => mean(tl.filter((t) => t.cityName === c).map((t) => t.meanTempC));
  const T0 = segTemp(seq[0]);
  const T1 = segTemp(seq[seq.length - 1]);
  P.push({
    id: P.length,
    slug: r.slug,
    born: String(r.birth_city_display).split(",")[0],
    now: seq[seq.length - 1],
    nCities: seq.length,
    by: r.birth_year,
    co2: r.result?.globalContext?.co2PpmAtBirth,
    T0, T1, shift: T1 - T0,
    rain: rf.birthWindow.monthly.reduce((s, x) => s + x, 0),
    seas: Math.max(...bw.monthly) - Math.min(...bw.monthly),
    pT: mean(bw.monthly),
  });
}
const N = P.length;

// ---------- labels ----------
const trajOf = (p) => (p.nCities === 1 ? "rooted" : p.shift < -2 ? "cooled" : p.shift > 2 ? "heated" : "lateral");
P.forEach((p) => { p.traj = trajOf(p); });

// inheritance zones: frozen k-means, same seeding as archetypes.mjs
{
  const cols = ["pT", "seas", "logRain"];
  P.forEach((p) => { p.logRain = Math.log10(p.rain + 1); });
  const st = Object.fromEntries(cols.map((c) => { const v = P.map((p) => p[c]); return [c, [mean(v), sd(v)]]; }));
  const X = P.map((p) => cols.map((c) => (p[c] - st[c][0]) / st[c][1]));
  let C = [];
  for (let i = 0; i < 5; i++) C.push([...X[(i * 7919 + 13) % X.length]]);
  let A = [];
  for (let t = 0; t < 100; t++) {
    A = X.map((x) => { let b = 0, bd = Infinity; C.forEach((c, i) => { const d = c.reduce((s, v, j) => s + (v - x[j]) ** 2, 0); if (d < bd) { bd = d; b = i; } }); return b; });
    C = C.map((prev, i) => { const m = X.filter((_, j) => A[j] === i); return m.length ? prev.map((_, j) => mean(m.map((r) => r[j]))) : prev; });
  }
  // name zones by centroid character, not index
  const nameOf = {};
  [...new Set(A)].forEach((z) => {
    const m = P.filter((_, i) => A[i] === z);
    const T = mean(m.map((p) => p.pT)), S = mean(m.map((p) => p.seas)), R = mean(m.map((p) => p.rain));
    nameOf[z] = T < 18 ? "temperate" : S > 15 ? "continental" : R > 1600 ? "wet-coastal" : T < 25 ? "upland" : "hot-moderate";
  });
  P.forEach((p, i) => { p.zone = nameOf[A[i]]; });
}

// generation: the person-level alternative to inheritance (CO2 world you were handed)
const genOf = (p) => (p.by < 1985 ? "pre-1985" : p.by <= 2005 ? "1985-2005" : "post-2005");
P.forEach((p) => { p.gen = genOf(p); });

// archetype names, both grids (from the design deck)
const ZONE_GRID = {
  "temperate":    { rooted: "cool anchor",  lateral: "cool drifter",    cooled: "—",              heated: "into the heat" },
  "continental":  { rooted: "dry-rooted",   lateral: "plains mover",    cooled: "left the dry",   heated: "deeper inland" },
  "upland":       { rooted: "hill-rooted",  lateral: "temperate drift", cooled: "to the hills",   heated: "off the plateau" },
  "hot-moderate": { rooted: "heat-rooted",  lateral: "warm wanderer",   cooled: "out of the heat", heated: "hotter still" },
  "wet-coastal":  { rooted: "coast-rooted", lateral: "humid drifter",   cooled: "left the coast", heated: "rare" },
};
const GEN_GRID = {
  "pre-1985":  { rooted: "the elder root", lateral: "long drift",    cooled: "early renouncer", heated: "warmed twice over" },
  "1985-2005": { rooted: "steady middle",  lateral: "the mover",     cooled: "the migrant out", heated: "chose the heat" },
  "post-2005": { rooted: "inherited heat", lateral: "young drifter", cooled: "young renouncer", heated: "hottest hand dealt" },
};
P.forEach((p) => {
  p.zoneArch = ZONE_GRID[p.zone][p.traj];
  p.genArch = GEN_GRID[p.gen][p.traj];
});

// ---------- the 7 dimensions ----------
const DIMS = ["converge", "diverge", "bornGap", "nowGap", "rainGap", "seasGap", "yearGap"];
const gaps = (a, b) => {
  const bg = Math.abs(a.T0 - b.T0), ng = Math.abs(a.T1 - b.T1);
  return {
    converge: bg - ng, diverge: ng - bg, bornGap: bg, nowGap: ng,
    rainGap: Math.abs(a.rain - b.rain), seasGap: Math.abs(a.seas - b.seas), yearGap: Math.abs(a.by - b.by),
  };
};
// percentile lookup built from every pair in the corpus
const dist = Object.fromEntries(DIMS.map((d) => [d, []]));
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
  const g = gaps(P[i], P[j]);
  DIMS.forEach((d) => dist[d].push(g[d]));
}
DIMS.forEach((d) => dist[d].sort((x, y) => x - y));
const pctOf = (d, v) => {
  const a = dist[d];
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; }
  return (100 * lo) / a.length;
};
const PRIORITY = ["converge", "diverge", "rainGap", "bornGap", "nowGap", "seasGap", "yearGap"];
function scorePair(a, b, exclude = new Set()) {
  const g = gaps(a, b);
  let best = null;
  for (const d of DIMS) {
    if (exclude.has(d)) continue;
    const pc = pctOf(d, g[d]);
    // tie-break: within 5 points, prefer the more story-shaped dimension
    if (!best || pc > best.pct + 5 || (Math.abs(pc - best.pct) <= 5 && PRIORITY.indexOf(d) < PRIORITY.indexOf(best.dim))) {
      best = { dim: d, pct: pc, val: g[d] };
    }
  }
  return best;
}

// ---------- copy ----------
const f1 = (x) => x.toFixed(1);
function line(a, b, w) {
  const g = gaps(a, b);
  switch (w.dim) {
    case "converge": return `born into climates ${f1(Math.abs(a.T0 - b.T0))}°C apart — and now living ${f1(Math.abs(a.T1 - b.T1))}°C apart. You ended up in the same weather.`;
    case "diverge":  return `born into near-identical climates (${f1(Math.abs(a.T0 - b.T0))}°C apart) — now ${f1(Math.abs(a.T1 - b.T1))}°C apart. You started together and split.`;
    case "rainGap":  return `${(g.rainGap / 1000).toFixed(2)} metres of rain a year separates the places you grew up.`;
    case "bornGap":  return `you were born into climates ${f1(g.bornGap)}°C apart.`;
    case "nowGap":   return `you live in climates ${f1(g.nowGap)}°C apart.`;
    case "seasGap":  return `one of you grew up with ${f1(Math.max(a.seas, b.seas))}°C between hottest and coldest month; the other, ${f1(Math.min(a.seas, b.seas))}°C.`;
    case "yearGap":  return `${g.yearGap} years separate the worlds you were born into.`;
  }
}
const who = (p) => `${p.born}→${p.now} (${p.by}) [${p.zoneArch} / ${p.genArch}]`;

// ---------- top 3, dimension-diverse ----------
function connectionsFor(a, k = 3) {
  const used = new Set();
  const out = [];
  for (let n = 0; n < k; n++) {
    let bestB = null, bestW = null;
    for (const b of P) {
      if (b.id === a.id || out.some((o) => o.b.id === b.id)) continue;
      const w = scorePair(a, b, used);
      if (!w) continue;
      if (!bestW || w.pct > bestW.pct) { bestW = w; bestB = b; }
    }
    if (!bestB) break;
    out.push({ b: bestB, w: bestW });
    used.add(bestW.dim);
  }
  return out;
}

// ---------- output ----------
if (ONLY) {
  const a = P.find((p) => p.slug === ONLY);
  if (!a) { console.error("no such slug"); process.exit(1); }
  console.log("YOU: " + who(a) + `  shift ${a.shift > 0 ? "+" : ""}${f1(a.shift)}°C\n`);
  connectionsFor(a).forEach((c, i) => {
    console.log(`${i + 1}. [${c.w.dim} · p${c.w.pct.toFixed(0)}] ${who(c.b)}`);
    console.log(`   ${line(a, c.b, c.w)}\n`);
  });
  process.exit(0);
}

console.log(`corpus: ${N} people\n`);
console.log("=".repeat(78));
console.log("WORKED EXAMPLES — three connections each, forced onto different dimensions");
console.log("=".repeat(78));
// pick a spread: one of each trajectory, preferring interesting archetypes
const picks = ["cooled", "heated", "rooted", "lateral"]
  .map((t) => P.filter((p) => p.traj === t).sort((x, y) => Math.abs(y.shift) - Math.abs(x.shift))[0])
  .filter(Boolean);
for (const a of picks) {
  console.log(`\nYOU: ${who(a)}   shift ${a.shift > 0 ? "+" : ""}${f1(a.shift)}°C`);
  connectionsFor(a).forEach((c, i) => {
    console.log(`  ${i + 1}. [${c.w.dim.padEnd(8)} p${c.w.pct.toFixed(0).padStart(3)}] ${who(c.b)}`);
    console.log(`     "${line(a, c.b, c.w)}"`);
  });
}

console.log("\n" + "=".repeat(78));
console.log("STRONGEST PAIRS IN THE CORPUS, by winning dimension");
console.log("=".repeat(78));
for (const d of DIMS) {
  let best = null;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const g = gaps(P[i], P[j]);
    const pc = pctOf(d, g[d]);
    if (!best || pc > best.pc || (pc === best.pc && g[d] > best.v)) best = { a: P[i], b: P[j], pc, v: g[d] };
  }
  console.log(`\n${d.toUpperCase()}  (p${best.pc.toFixed(1)})`);
  console.log(`  ${who(best.a)}`);
  console.log(`  ${who(best.b)}`);
  console.log(`  "${line(best.a, best.b, { dim: d })}"`);
}

console.log("\n" + "=".repeat(78));
console.log("ARCHETYPE COVERAGE — do the grid cells actually fill?");
console.log("=".repeat(78));
for (const [label, key] of [["INHERITANCE x TRAJECTORY", "zoneArch"], ["GENERATION x TRAJECTORY", "genArch"]]) {
  const grid = key === "zoneArch" ? ZONE_GRID : GEN_GRID;
  console.log(`\n${label}`);
  const rowsK = Object.keys(grid);
  const colsK = ["rooted", "lateral", "cooled", "heated"];
  console.log("".padEnd(14) + colsK.map((c) => c.padStart(9)).join(""));
  for (const rk of rowsK) {
    const counts = colsK.map((ck) => P.filter((p) => (key === "zoneArch" ? p.zone : p.gen) === rk && p.traj === ck).length);
    console.log(rk.padEnd(14) + counts.map((c) => String(c).padStart(9)).join(""));
  }
  const empty = rowsK.flatMap((rk) => colsK.filter((ck) => !P.some((p) => (key === "zoneArch" ? p.zone : p.gen) === rk && p.traj === ck)).map((ck) => `${rk}/${ck}`));
  console.log(`empty cells: ${empty.length ? empty.join(", ") : "none"}`);
}
