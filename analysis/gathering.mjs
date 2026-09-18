#!/usr/bin/env node
/**
 * Reproduces every number in CONFERENCE-DESIGN.md.
 *
 *   node analysis/gathering.mjs <dump.json> [--crowd 1500]
 *
 * Companion to archetypes.mjs. Where that one asks "what can we classify?",
 * this one asks "does the classification support a room mechanic?" — i.e.
 * match scarcity, the shape of a physically sorted room, and chain connectivity.
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node analysis/gathering.mjs <dump.json> [--crowd 1500]");
  process.exit(1);
}
const ci = process.argv.indexOf("--crowd");
const CROWD = ci > -1 ? Number(process.argv[ci + 1]) : 1500;
const rows = JSON.parse(readFileSync(path, "utf8"));

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// One record per person: where they started, where they ended, and the gap.
// Deliberately mirrors archetypes.mjs — trajectory uses first vs last city only,
// which is also why the conference signup can be three fields (see doc §5).
const P = [];
for (const r of rows) {
  const tl = r.result?.tempTimeline?.years;
  if (!tl || tl.length < 8) continue;
  const bw = r.result?.birthWindow, rf = r.result?.rainfall;
  if (!bw?.monthly || !rf?.birthWindow) continue;
  const seq = [...new Set(tl.map((t) => t.cityName))];
  const segTemp = (c) => mean(tl.filter((t) => t.cityName === c).map((t) => t.meanTempC));
  const T0 = segTemp(seq[0]);
  const T1 = segTemp(seq[seq.length - 1]);
  // warming under a stayer: trend across their own timeline, in degrees over the life
  const yrs = tl.map((t) => t.year);
  const mx = mean(yrs), my = mean(tl.map((t) => t.meanTempC));
  let n = 0, d = 0;
  tl.forEach((t, i) => { n += (yrs[i] - mx) * (t.meanTempC - my); d += (yrs[i] - mx) ** 2; });
  const slope = d ? n / d : 0;
  P.push({
    id: P.length,
    city: String(r.birth_city_display).split(",")[0],
    country: r.birth_city?.country,
    lastCity: seq[seq.length - 1],
    nCities: seq.length,
    T0, T1,
    shift: T1 - T0,
    warmedUnderThem: slope * (yrs[yrs.length - 1] - yrs[0]),
    // place signature, for the inheritance zones
    pT: mean(bw.monthly),
    pS: Math.max(...bw.monthly) - Math.min(...bw.monthly),
    pR: Math.log10(rf.birthWindow.monthly.reduce((s, x) => s + x, 0) + 1),
  });
}
const N = P.length;
const traj = (p) => (p.nCities === 1 ? "rooted" : p.shift < -2 ? "cooled" : p.shift > 2 ? "heated" : "lateral");
P.forEach((p) => { p.traj = traj(p); });
const scale = (x) => Math.round((x * CROWD) / N);

// Inheritance zones — same deterministic k-means as archetypes.mjs, so the two
// scripts agree on who is in which zone.
{
  const cols = ["pT", "pS", "pR"];
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) || 1; };
  const st = Object.fromEntries(cols.map((c) => { const v = P.map((p) => p[c]); return [c, [mean(v), sd(v)]]; }));
  const X = P.map((p) => cols.map((c) => (p[c] - st[c][0]) / st[c][1]));
  let C = [];
  for (let i = 0; i < 5; i++) C.push([...X[(i * 7919 + 13) % X.length]]);
  let A = [];
  for (let t = 0; t < 100; t++) {
    A = X.map((x) => { let b = 0, bd = Infinity; C.forEach((c, i) => { const d = c.reduce((s, v, j) => s + (v - x[j]) ** 2, 0); if (d < bd) { bd = d; b = i; } }); return b; });
    C = C.map((prev, i) => { const m = X.filter((_, j) => A[j] === i); return m.length ? prev.map((_, j) => mean(m.map((r) => r[j]))) : prev; });
  }
  P.forEach((p, i) => { p.zone = A[i]; });
}

const H = (s) => console.log("\n" + "=".repeat(70) + "\n" + s + "\n" + "=".repeat(70));
console.log(`n = ${N}   crowd = ${CROWD}   (scale factor x${(CROWD / N).toFixed(1)})`);

H("1. MATCH SCARCITY — does a 'find your twin' hunt motivate crossing a room?");
console.log("A rule is useful only if the pool is small but never empty.\n");
// ASYMMETRY is the column that killed the "different country" rule. A rule can have
// a healthy median pool and still be unusable if it is lopsided between groups: the
// minority gets mobbed and the majority effectively strikes out.
const IN = P.filter((p) => p.country === "IN");
const FO = P.filter((p) => p.country !== "IN");
console.log(`corpus: India-born ${IN.length}, foreign-born ${FO.length} (${((100 * FO.length) / N).toFixed(0)}%)\n`);
console.log("rule".padEnd(46), "pool".padStart(5), "@crowd".padStart(7), "zero".padStart(5), "asym".padStart(7));
const RULES = [
  ["same trajectory", (a, b) => a.traj === b.traj],
  ["birth climate = their present climate", (a, b) => Math.abs(a.T0 - b.T1) < 0.5],
  ["same traj + shift within 1C + diff city", (a, b) => a.traj === b.traj && Math.abs(a.shift - b.shift) < 1 && a.city !== b.city],
  ["same traj + different zone", (a, b) => a.traj === b.traj && a.zone !== b.zone],
  ["same traj + different country  [REJECTED]", (a, b) => a.traj === b.traj && a.country !== b.country],
  ["same traj + diff zone + birthT >3C apart", (a, b) => a.traj === b.traj && a.zone !== b.zone && Math.abs(a.pT - b.pT) > 3],
  ["shift within 0.5C + birth temp differs >5C", (a, b) => Math.abs(a.shift - b.shift) < 0.5 && Math.abs(a.T0 - b.T0) > 5],
  ["mirror: your shift = -their shift", (a, b) => Math.abs(a.shift + b.shift) < 1 && Math.abs(a.shift) > 2],
];
for (const [name, fn] of RULES) {
  const pool = (a) => P.filter((b) => b.id !== a.id && fn(a, b)).length;
  const sizes = P.map(pool);
  const zero = sizes.filter((x) => x === 0).length;
  const asym = med(FO.map(pool)) / Math.max(med(IN.map(pool)), 1);
  console.log(name.padEnd(46), String(med(sizes)).padStart(5), String(scale(med(sizes))).padStart(7),
    (String(zero) + (zero / N > 0.2 ? "!!" : "")).padStart(5),
    (asym.toFixed(1) + "x" + (asym > 4 || asym < 0.25 ? " !!" : "")).padStart(7));
}
console.log("\n'zero' = people who match nobody. Anything above ~0 disqualifies a rule:");
console.log("those people get handed an empty result in a room full of strangers.");
console.log("'asym' = foreign-born median pool / India-born median pool. Far from 1.0");
console.log("means the rule treats the two groups very differently — see doc §2 [v2].");

H("2. SHAPE OF THE ROOM — what a physically sorted crowd looks like");
console.log("Position on the line = lived temperature shift (born -> now).\n");
const BINS = [[-Infinity, -8, "< -8"], [-8, -4, "-8..-4"], [-4, -2, "-4..-2"], [-2, -0.5, "-2..-0.5"],
  [-0.5, 0.5, "~0 / rooted"], [0.5, 2, "0.5..2"], [2, 4, "2..4"], [4, 8, "4..8"], [8, Infinity, "> 8"]];
for (const [lo, hi, lab] of BINS) {
  const c = P.filter((p) => p.shift >= lo && p.shift < hi).length;
  const pct = (100 * c) / N;
  console.log(lab.padStart(13), String(c).padStart(4), (pct.toFixed(1) + "%").padStart(7),
    "| @crowd " + String(scale(c)).padStart(4), " " + "#".repeat(Math.round(pct)));
}
const modal = Math.max(...BINS.map(([lo, hi]) => P.filter((p) => p.shift >= lo && p.shift < hi).length));
console.log(`\n-> largest single bin holds ${((100 * modal) / N).toFixed(0)}% of the room (~${scale(modal)} people).`);
console.log("   A single sorted line is therefore mostly one lump. Hence the two-line design.");

H("3. TWO-LINE DESIGN — movers vs stayers on the same scale");
const movers = P.filter((p) => p.nCities > 1);
const stayers = P.filter((p) => p.nCities === 1);
const spanA = Math.max(...movers.map((p) => p.shift)) - Math.min(...movers.map((p) => p.shift));
const wu = stayers.map((p) => p.warmedUnderThem).filter((x) => isFinite(x));
const spanB = Math.max(...wu) - Math.min(...wu);
console.log(`Line A (moved,       n=${movers.length}, @crowd ~${scale(movers.length)}): span ${spanA.toFixed(1)} C`);
console.log(`Line B (never moved, n=${stayers.length}, @crowd ~${scale(stayers.length)}): span ${spanB.toFixed(1)} C`);
console.log(`\n-> ratio ${(spanA / spanB).toFixed(1)}x. Line A crosses the hall; line B is a clump.`);
const cooled = movers.filter((p) => p.shift < -2).length;
const heated = movers.filter((p) => p.shift > 2).length;
console.log(`\namong movers: cooled ${cooled} : heated ${heated}  = ${(cooled / heated).toFixed(1)}:1 toward cooler`);

H("4. VENUE SKEW — Bangalore is a climate refuge");
const inBlr = P.filter((p) => /Bengaluru|Bangalore/i.test(String(p.lastCity)));
console.log(`currently living in Bangalore: ${inBlr.length} (${((100 * inBlr.length) / N).toFixed(0)}% of corpus)`);
const td = {};
inBlr.forEach((p) => { td[p.traj] = (td[p.traj] || 0) + 1; });
console.log("  their trajectories:", td);
const toBlr = inBlr.filter((p) => p.nCities > 1);
console.log(`  of those who MOVED to Bangalore (n=${toBlr.length}):`,
  `cooled ${toBlr.filter((p) => p.shift < -2).length} / heated ${toBlr.filter((p) => p.shift > 2).length}`,
  ` median shift ${med(toBlr.map((p) => p.shift)).toFixed(1)} C`);
console.log("\n-> Line A will lean cooled rather than spreading evenly.");
console.log("   Centre it on the room's median, not on zero.");

H("5. CHAIN FEASIBILITY — and why it is not what it looks like");
console.log("Chain link: A's birth climate ~= B's present climate.\n");
for (const tol of [0.3, 0.5, 1.0]) {
  const adj = P.map((a) => P.filter((b) => b.id !== a.id && Math.abs(a.T0 - b.T1) < tol).map((b) => b.id));
  let best = [];
  for (let s = 0; s < N; s++) {
    const seen = new Set([s]);
    let cur = s;
    const path = [s];
    for (;;) {
      const nxt = adj[cur].filter((x) => !seen.has(x));
      if (!nxt.length) break;
      nxt.sort((x, y) => adj[y].length - adj[x].length);
      cur = nxt[0];
      seen.add(cur);
      path.push(cur);
    }
    if (path.length > best.length) best = path;
  }
  const deg = adj.map((a) => a.length);
  console.log(`tol +/-${tol}C: longest chain ${String(best.length).padStart(3)}/${N}`,
    ` median out-degree ${String(med(deg)).padStart(3)}`,
    ` dead ends ${deg.filter((d) => d === 0).length}`);
  if (tol === 0.5) {
    console.log("   head of chain:", best.slice(0, 8).map((i) => `${P[i].city}(${P[i].T1.toFixed(0)}C)`).join(" -> "));
    const temps = best.map((i) => P[i].T1);
    console.log(`   temperature span ACROSS the whole chain: ${(Math.max(...temps) - Math.min(...temps)).toFixed(1)} C`);
    console.log("   -> a long chain that barely moves in temperature is a clump, not a gradient.");
    console.log("      If a gradient is wanted, just sort people by current climate.");
  }
}
