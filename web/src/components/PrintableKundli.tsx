import { useEffect, useState } from "react";
import QRCode from "qrcode";

import type { MonthlyDeltaResponse, HottestYearBlade } from "@/lib/api";
import { EmissionsPlume } from "@/components/EmissionsPlume";
import { buildRemedies } from "@/components/RemediesSection";
import { IcebergContent } from "@/components/ArcticIcebergChart";
import { parallelAnnulusPath, permutationForSeed } from "@/lib/organicTreeRing";

import fireCorner from "../assets/fire-corner.png";
import airCorner from "../assets/air-corner.png";
import earthCorner from "../assets/earth-corner.png";
import waterCorner from "../assets/water-corner.png";

// The printable kundli is a fortune-teller (cootie-catcher) crease map drawn on a
// 600x600 square (viewBox units): four corner element tiles, eight black star-arms
// carrying the data-field labels + per-kundli values, and four white center flaps
// (headings only for now — the graphics land later). Every piece is inset by GUTTER
// so uniform white gutters show through the white background.
const GUTTER = 4;
const TILE = 150 - GUTTER * 2;

const CORNERS = [
  { href: fireCorner, x: GUTTER, y: GUTTER },
  { href: airCorner, x: 450 + GUTTER, y: GUTTER },
  { href: earthCorner, x: GUTTER, y: 450 + GUTTER },
  { href: waterCorner, x: 450 + GUTTER, y: 450 + GUTTER },
];

const ARM_FONT = "var(--font-sans)";
const FLAP_FONT = "var(--font-alegreya-sans)";
const VALUE_FONT = "var(--font-alegreya)";

type Pt = [number, number];

function toPts(s: string): Pt[] {
  return s
    .trim()
    .split(/\s+/)
    .map((p) => {
      const [x, y] = p.split(",").map(Number);
      return [x, y] as Pt;
    });
}

// Inward offset of a convex polygon by distance d (toward its centroid).
function insetPts(pts: Pt[], d: number): Pt[] {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n;
  const cy = pts.reduce((s, p) => s + p[1], 0) / n;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    let ux = b[0] - a[0];
    let uy = b[1] - a[1];
    const len = Math.hypot(ux, uy);
    ux /= len;
    uy /= len;
    let nx = -uy;
    let ny = ux;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if ((cx - mx) * nx + (cy - my) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { qx: a[0] + nx * d, qy: a[1] + ny * d, ux, uy };
  });
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const denom = l1.ux * l2.uy - l1.uy * l2.ux;
    const t = ((l2.qx - l1.qx) * l2.uy - (l2.qy - l1.qy) * l2.ux) / denom;
    out.push([l1.qx + l1.ux * t, l1.qy + l1.uy * t]);
  }
  return out;
}

function insetPolygon(points: string, d: number): string {
  return insetPts(toPts(points), d)
    .map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`)
    .join(" ");
}

type ArmKey =
  | "BIRTH PLACE"
  | "BIRTH YEAR"
  | "BIRTH YEAR EMISSIONS"
  | "OCEAN-TEMPERATURE CHANGE"
  | "WETTEST YEAR"
  | "LOWEST TEMPERATURE EXPERIENCED"
  | "CHANGE IN SEA-LEVEL"
  | "HIGHEST TEMPERATURE EXPERIENCED";

// Eight black arm-triangles. `cx/cy` anchors the small uppercase label along the
// diamond edge; `rot` aligns text with that edge (kept within [-45,45] so it reads
// upright). The per-kundli value is drawn further out toward the corner tile.
const ARMS: {
  pts: string;
  cx: number;
  cy: number;
  rot: number;
  label: ArmKey;
}[] = [
  {
    pts: "150,0 300,0 150,150",
    cx: 215,
    cy: 65,
    rot: -45,
    label: "BIRTH PLACE",
  },
  { pts: "300,0 450,0 450,150", cx: 385, cy: 65, rot: 45, label: "BIRTH YEAR" },
  {
    pts: "600,150 600,300 450,150",
    cx: 535,
    cy: 215,
    rot: 45,
    label: "BIRTH YEAR EMISSIONS",
  },
  {
    pts: "600,300 600,450 450,450",
    cx: 535,
    cy: 385,
    rot: -45,
    label: "OCEAN-TEMPERATURE CHANGE",
  },
  {
    pts: "450,600 300,600 450,450",
    cx: 385,
    cy: 535,
    rot: -45,
    label: "WETTEST YEAR",
  },
  {
    pts: "300,600 150,600 150,450",
    cx: 215,
    cy: 535,
    rot: 45,
    label: "LOWEST TEMPERATURE EXPERIENCED",
  },
  {
    pts: "0,450 0,300 150,450",
    cx: 65,
    cy: 385,
    rot: 45,
    label: "CHANGE IN SEA-LEVEL",
  },
  {
    pts: "0,300 0,150 150,150",
    cx: 65,
    cy: 215,
    rot: -45,
    label: "HIGHEST TEMPERATURE EXPERIENCED",
  },
];

const FLAP_SHAPES = [
  "300,0 450,150 300,300 150,150", // top
  "450,150 600,300 450,450 300,300", // right
  "300,300 450,450 300,600 150,450", // bottom
  "150,150 300,300 150,450 0,300", // left
];
const TOP_FLAP = "300,0 450,150 300,300 150,150";
const RIGHT_FLAP = "450,150 600,300 450,450 300,300";
const LEFT_FLAP = "150,150 300,300 150,450 0,300";
const BOTTOM_FLAP = "300,300 450,450 300,600 150,450";

// Maps the emissions plume's 400x400 diamond (centre 200,200; vertex radius 188)
// exactly onto the right flap's diamond (centre 450,300; radius 150).
const PLUME_SCALE = 150 / 188;
const PLUME_TX = 450 - 200 * PLUME_SCALE;
const PLUME_TY = 300 - 200 * PLUME_SCALE;

// Iceberg (180x184 viewBox, centre 90,92) scaled to sit centred in the left flap.
const BERG_SCALE = 0.92;
const BERG_CX = 150;
const BERG_CY = 286.2;
const BERG_TX = BERG_CX - 90 * BERG_SCALE;
const BERG_TY = BERG_CY - 92 * BERG_SCALE;

const RING_CENTER = 200;
const RING_MIN_RADIUS = 28;
const RING_MAX_RADIUS = 172;
const RING_WIDTH_EXPONENT = 1.15;

function hashLabel(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function mixHex(a: string, b: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * clamp);
  const g = Math.round(ag + (bg - ag) * clamp);
  const bl = Math.round(ab + (bb - ab) * clamp);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

function ringWoodColor(norm: number): string {
  if (norm < 0.35) return mixHex("#c9b896", "#a8c4b0", norm / 0.35);
  if (norm < 0.7) return mixHex("#a8c4b0", "#6a9eb5", (norm - 0.35) / 0.35);
  return mixHex("#6a9eb5", "#3d6f8c", (norm - 0.7) / 0.3);
}

interface YearPoint {
  year: number;
  precipMm: number;
}

interface PrintableRing {
  year: number;
  precipMm: number;
  d: string;
  color: string;
}

function buildPrintableRings(
  years: YearPoint[],
  wigglePerm: number[],
): PrintableRing[] {
  if (years.length === 0) return [];
  const precipValues = years.map((y) => y.precipMm);
  const colorMin = Math.min(...precipValues);
  const colorMax = Math.max(...precipValues);
  const colorSpan = colorMax - colorMin;

  const availableSpan = RING_MAX_RADIUS - RING_MIN_RADIUS;
  const weights = years.map((p) => Math.pow(p.precipMm, RING_WIDTH_EXPONENT));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let radius = RING_MIN_RADIUS;
  const rings: PrintableRing[] = [];

  for (let index = 0; index < years.length; index += 1) {
    const point = years[index]!;
    const width =
      totalWeight > 0
        ? Math.max(1.25, (weights[index]! / totalWeight) * availableSpan)
        : availableSpan / years.length;
    const inner = radius;
    const outer = inner + width;
    const norm = colorSpan > 0 ? (point.precipMm - colorMin) / colorSpan : 0.5;

    rings.push({
      year: point.year,
      precipMm: point.precipMm,
      d: parallelAnnulusPath(
        RING_CENTER,
        RING_CENTER,
        inner,
        outer,
        wigglePerm,
      ),
      color: ringWoodColor(norm),
    });
    radius = outer;
  }

  return rings;
}

function ringSlatPath(
  cx: number,
  cy: number,
  a0: number,
  a1: number,
  rInner: number,
  rOuter: number,
): string {
  const xi0 = cx + Math.cos(a0) * rInner;
  const yi0 = cy + Math.sin(a0) * rInner;
  const xo0 = cx + Math.cos(a0) * rOuter;
  const yo0 = cy + Math.sin(a0) * rOuter;
  const xo1 = cx + Math.cos(a1) * rOuter;
  const yo1 = cy + Math.sin(a1) * rOuter;
  const xi1 = cx + Math.cos(a1) * rInner;
  const yi1 = cy + Math.sin(a1) * rInner;
  const largeOuter = a1 - a0 > Math.PI ? 1 : 0;
  const largeInner = a1 - a0 > Math.PI ? 1 : 0;

  return [
    `M ${xi0} ${yi0}`,
    `L ${xo0} ${yo0}`,
    `A ${rOuter} ${rOuter} 0 ${largeOuter} 1 ${xo1} ${yo1}`,
    `L ${xi1} ${yi1}`,
    `A ${rInner} ${rInner} 0 ${largeInner} 0 ${xi0} ${yi0}`,
    "Z",
  ].join(" ");
}

interface PrintableFanBlade {
  year: number;
  dOutline: string;
  dHeat: string;
  color: string;
  textX: number;
  textY: number;
  tempX: number;
  tempY: number;
  rotDeg: number;
  midAngle: number;
  peakTemp: number;
}

function buildPrintableFanBlades(
  blades: HottestYearBlade[],
): PrintableFanBlade[] {
  if (blades.length === 0) return [];

  const temps = blades.map((b) => b.peakTempC);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const tempSpan = maxTemp - minTemp;

  const capacity = 18;
  const slatGapRatio = 0.14;
  const stepOverlapRatio = 0.22;
  const fanArcSpan = (150 * Math.PI) / 180;
  const fanArcCenter = -Math.PI / 2;

  const slatWidth = fanArcSpan / (capacity + (capacity - 1) * slatGapRatio);
  const gap = slatWidth * slatGapRatio;
  const pitch = slatWidth + gap;
  const step = pitch - pitch * stepOverlapRatio;
  const n = blades.length;
  const groupSpan = n === 1 ? slatWidth : (n - 1) * step + slatWidth;
  const arcStart = fanArcCenter - groupSpan / 2;

  const cx = 300;
  const cy = 272;
  const rOuter = 175;
  const rInner = 44;

  const uniqueCities = Array.from(
    new Set(blades.map((b) => b.cityName ?? b.displayName)),
  );
  const CITY_COLORS = ["#c45a3a", "#3d6b7a", "#7a5c2e", "#5c4a6b", "#2d5c45"];

  return blades.map((blade, idx) => {
    const a0 = arcStart + idx * step;
    const a1 = a0 + slatWidth;
    const midAngle = (a0 + a1) / 2;

    const heat = tempSpan > 0 ? (blade.peakTempC - minTemp) / tempSpan : 0.5;
    const heatFillR = Math.max(rInner + 10, rInner + heat * (rOuter - rInner));

    const cityName = blade.cityName ?? blade.displayName;
    const cityIdx = uniqueCities.indexOf(cityName);
    const color = CITY_COLORS[cityIdx % CITY_COLORS.length] ?? CITY_COLORS[0];

    const dOutline = ringSlatPath(cx, cy, a0, a1, rInner, rOuter);
    const dHeat = ringSlatPath(cx, cy, a0, a1, rInner, heatFillR);

    const rText = rInner + 0.5 * (rOuter - rInner);
    const textX = cx + rText * Math.cos(midAngle);
    const textY = cy + rText * Math.sin(midAngle);

    const rTempText = rInner + 0.85 * (rOuter - rInner);
    const tempX = cx + rTempText * Math.cos(midAngle);
    const tempY = cy + rTempText * Math.sin(midAngle);

    const rotDeg = (midAngle * 180) / Math.PI;

    return {
      year: blade.year,
      dOutline,
      dHeat,
      color,
      textX,
      textY,
      tempX,
      tempY,
      rotDeg,
      midAngle,
      peakTemp: blade.peakTempC,
    };
  });
}

// Centered (upright) flap headings.
const FLAP_HEADINGS = [
  { cx: 300, cy: 540, lines: ["MONSOONS", "EXPERIENCED"] },
];

// Flap headings that run along the flap's outer diamond edge.
const EDGE_LABELS = [
  { cx: 84, cy: 367, rot: 45, label: "ARCTIC ICE SUMMER MINIMUM" },
  { cx: 516, cy: 367, rot: -45, label: "ANNUAL CARBON EMISSIONS" },
];

// A value sits perpendicular to its label, offset toward the outer corner tile
// (away from the sheet centre), so label and value never overlap.
function valueAnchor(cx: number, cy: number, rot: number, d = 32): Pt {
  const rad = (rot * Math.PI) / 180;
  let px = -Math.sin(rad);
  let py = Math.cos(rad);
  if ((cx - 300) * px + (cy - 300) * py < 0) {
    px = -px;
    py = -py;
  }
  return [cx + px * d, cy + py * d];
}

// "Bengaluru, Karnataka, India" -> "Bengaluru, India"; drops the state and any
// parenthetical, keeping just city + country so the value fits the arm.
function shortPlace(dn?: string | null): string {
  const parts = (dn ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  const city = parts[0].replace(/\s*\([^)]*\)/g, "").trim();
  const country = parts[parts.length - 1];
  return country && country !== city ? `${city}, ${country}` : city;
}

// Just the city, no state/country/parenthetical (e.g. for "City, Year" lines).
function cityName(dn?: string | null): string {
  return (dn ?? "")
    .split(",")[0]
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
}

// Hard safety cap so an unusually long value can never run past the arm.
const VALUE_MAX_CHARS = 20;
function truncate(s: string): string {
  return s.length > VALUE_MAX_CHARS
    ? `${s.slice(0, VALUE_MAX_CHARS - 1).trimEnd()}…`
    : s;
}

// Map an arm to its per-kundli value lines. Ocean-temperature change has data
// from globalContext.oceanTempRiseC. `birthPlace` overrides the city display if given.
function armValue(
  label: ArmKey,
  data: MonthlyDeltaResponse,
  birthPlace?: string,
): string[] {
  switch (label) {
    case "BIRTH PLACE":
      return [
        shortPlace(birthPlace || data.city?.displayName || data.city?.name),
      ].filter(Boolean);
    case "BIRTH YEAR":
      return data.birthYear ? [String(data.birthYear)] : [];
    case "BIRTH YEAR EMISSIONS":
      return data.indiaEmissions
        ? [`${Math.round(data.indiaEmissions.firstCo2Mt)} Mt`]
        : [];
    case "OCEAN-TEMPERATURE CHANGE": {
      const c = data.globalContext?.oceanTempRiseC;
      if (c == null) return [];
      const sign = c > 0 ? "+" : "";
      return [`${sign}${c.toFixed(2)} °C`];
    }
    case "WETTEST YEAR": {
      let best: { displayName: string; year: number; precip: number } | null =
        null;
      for (const c of data.rainRings?.byCity ?? []) {
        for (const y of c.years) {
          if (!best || y.precipMm > best.precip) {
            best = {
              displayName: c.displayName,
              year: y.year,
              precip: y.precipMm,
            };
          }
        }
      }
      if (!best) return [];
      return [
        `${cityName(best.displayName)}, ${best.year}`,
        `${Math.round(best.precip)} mm`,
      ];
    }
    case "LOWEST TEMPERATURE EXPERIENCED": {
      const tt = data.tempTimeline;
      if (!tt?.coolestYear) return [];
      const entry = tt.years?.find((y) => y.year === tt.coolestYear);
      return [shortPlace(entry?.displayName), String(tt.coolestYear)].filter(
        Boolean,
      );
    }
    case "CHANGE IN SEA-LEVEL": {
      const mm = data.globalContext?.seaLevelRiseMm;
      return mm != null ? [`+${Math.round(mm)} mm`] : [];
    }
    case "HIGHEST TEMPERATURE EXPERIENCED": {
      const blades = data.hottestYears?.blades ?? [];
      if (!blades.length) return [];
      const b = blades.reduce((m, x) => (x.peakTempC > m.peakTempC ? x : m));
      return [
        `${Math.round(b.peakTempC)}°C`,
        shortPlace(b.displayName),
        String(b.year),
      ];
    }
    default:
      return [];
  }
}

/**
 * Renders the shareable-link QR for the printed kundli. The URL is encoded
 * directly into the QR (no redirect service), so it never expires or hits a
 * scan limit. Rendered at 2x for a crisp print.
 */
function PrintQrCode({ url, size = 96 }: { url: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 0,
      width: size * 2,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((src) => {
        if (!cancelled) setDataUrl(src);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [url, size]);

  if (!dataUrl) return null;

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt="Scan to open this kundli"
      style={{ display: "block" }}
    />
  );
}

type PrintableKundliProps = {
  data: MonthlyDeltaResponse;
  /** Overrides the birth-place display (e.g. record.birthCityDisplay). */
  birthPlace?: string;
  /** Absolute shareable URL; when set, a QR to it is printed in the bottom strip. */
  shareUrl?: string;
  /** Extra classes for the A4 sheet (sizing / positioning). */
  className?: string;
};

export function PrintableKundli({
  data,
  birthPlace,
  shareUrl,
  className,
}: PrintableKundliProps) {
  return (
    <div
      id="kundli-sheet"
      className={`bg-white flex flex-col relative select-none ${className ?? ""}`}
    >
      <div className="w-full aspect-square relative bg-white">
        <svg
          viewBox="0 0 600 600"
          className="w-full h-full"
          style={{ display: "block" }}
        >
          {/* Clip each arm's value to its triangle so text can never spill out;
              clip the emissions plume to the right flap (just inside its outline). */}
          <defs>
            {ARMS.map((arm) => (
              <clipPath
                key={arm.label}
                id={`arm-clip-${arm.label.replace(/\s+/g, "-")}`}
              >
                <polygon points={insetPolygon(arm.pts, GUTTER)} />
              </clipPath>
            ))}
            <clipPath id="flap-clip-right">
              <polygon points={insetPolygon(RIGHT_FLAP, GUTTER + 2)} />
            </clipPath>
            <clipPath id="flap-clip-left">
              <polygon points={insetPolygon(LEFT_FLAP, GUTTER + 2)} />
            </clipPath>
            <clipPath id="flap-clip-bottom">
              <polygon points={insetPolygon(BOTTOM_FLAP, GUTTER + 2)} />
            </clipPath>
            <clipPath id="flap-clip-top">
              <polygon points={insetPolygon(TOP_FLAP, GUTTER + 2)} />
            </clipPath>
          </defs>

          {/* Black star-arms */}
          {ARMS.map((arm) => (
            <polygon
              key={arm.label}
              points={insetPolygon(arm.pts, GUTTER)}
              fill="black"
            />
          ))}

          {/* White center flaps */}
          {FLAP_SHAPES.map((shape) => (
            <polygon
              key={shape}
              points={insetPolygon(shape, GUTTER)}
              fill="white"
              stroke="black"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))}

          {/* Record Hot Years Experienced (top flap), scaled + clipped to fit. */}
          {data.hottestYears?.blades?.length
            ? (() => {
                const fanBlades = buildPrintableFanBlades(
                  data.hottestYears.blades,
                );

                return (
                  <g clipPath="url(#flap-clip-top)">
                    {/* Ribs (connector lines) between pivot and blades */}
                    {fanBlades.map((blade) => (
                      <line
                        key={`rib-${blade.year}`}
                        x1={300}
                        y1={272}
                        x2={300 + Math.cos(blade.midAngle) * 175}
                        y2={272 + Math.sin(blade.midAngle) * 175}
                        stroke="#2a2418"
                        strokeWidth={1.25}
                        strokeLinecap="round"
                      />
                    ))}

                    {fanBlades.map((blade) => (
                      <g key={blade.year}>
                        {/* Outline / base slat */}
                        <path
                          d={blade.dOutline}
                          fill="#faf7f2"
                          stroke="#2a2418"
                          strokeWidth={1.05}
                          strokeLinejoin="round"
                        />
                        {/* Heat filled region */}
                        <path
                          d={blade.dHeat}
                          fill={blade.color}
                          fillOpacity={0.65}
                          stroke="none"
                        />
                        {/* Year label written inside the blade */}
                        <text
                          x={blade.textX}
                          y={blade.textY}
                          transform={`rotate(${blade.rotDeg} ${blade.textX} ${blade.textY})`}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#334155"
                          fontFamily={VALUE_FONT}
                          fontSize={9}
                          fontWeight={600}
                        >
                          {blade.year}
                        </text>
                        {/* Temperature label written near the outer edge */}
                        <text
                          x={blade.tempX}
                          y={blade.tempY}
                          transform={`rotate(${blade.rotDeg} ${blade.tempX} ${blade.tempY})`}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#1e293b"
                          fontFamily={VALUE_FONT}
                          fontSize={8}
                          fontWeight={600}
                        >
                          {blade.peakTemp.toFixed(1)}°
                        </text>
                      </g>
                    ))}
                    {/* Pivot Pin */}
                    <circle cx={300} cy={272} r={4.5} fill="#2a2418" />
                  </g>
                );
              })()
            : null}

          {/* Annual carbon emissions plume (right flap), scaled + clipped to fit. */}
          {data.indiaEmissions?.years?.length ? (
            <g clipPath="url(#flap-clip-right)">
              <g
                transform={`translate(${PLUME_TX} ${PLUME_TY}) scale(${PLUME_SCALE})`}
              >
                <EmissionsPlume data={data.indiaEmissions} />
              </g>
            </g>
          ) : null}

          {/* Arctic ice summer minimum iceberg (left flap), scaled + clipped to fit. */}
          {data.globalContext?.arcticIce
            ? (() => {
                const arctic = data.globalContext.arcticIce;
                const comparison = arctic.comparison;
                const birthExtent = arctic.birthWindow.extentMkm2;
                const meltFrac =
                  birthExtent > 0
                    ? Math.min(
                        0.85,
                        Math.max(0.06, arctic.lostMkm2 / birthExtent),
                      )
                    : 0;
                const TOP = 1;
                const BOTTOM = 183;
                const meltLine = TOP + meltFrac * (BOTTOM - TOP);

                return (
                  <g clipPath="url(#flap-clip-left)">
                    <g
                      transform={`translate(${BERG_TX} ${BERG_TY}) scale(${BERG_SCALE})`}
                    >
                      <IcebergContent arctic={arctic} idPrefix="print-berg" />
                      {comparison ? (
                        <g>
                          <text
                            x={77}
                            y={meltLine / 2 - 1.5}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontFamily={ARM_FONT}
                            fontWeight="bold"
                            fontSize={9 / BERG_SCALE}
                            fill="#0f172a"
                          >
                            ~{Math.round(comparison.multiple * 100)}%
                          </text>
                          <text
                            x={77}
                            y={meltLine / 2 + 9.5}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontFamily={VALUE_FONT}
                            fontSize={9 / BERG_SCALE}
                            fill="#334155"
                          >
                            size of {comparison.name}
                          </text>
                        </g>
                      ) : null}
                    </g>
                  </g>
                );
              })()
            : null}

          {/* Monsoons Experienced (bottom flap), combined from all cities, scaled + clipped to fit. */}
          {data.rainRings?.byCity?.length
            ? (() => {
                const cities = data.rainRings.byCity;
                const combinedYearsMap = new Map<number, number>();
                for (const city of cities) {
                  for (const y of city.years) {
                    const existing = combinedYearsMap.get(y.year);
                    if (existing === undefined || y.precipMm > existing) {
                      combinedYearsMap.set(y.year, y.precipMm);
                    }
                  }
                }
                const combinedYears = Array.from(combinedYearsMap.entries())
                  .map(([year, precipMm]) => ({ year, precipMm }))
                  .sort((a, b) => a.year - b.year);

                if (combinedYears.length === 0) return null;

                const seedString = cities.map((c) => c.displayName).join(",");
                const wigglePerm = permutationForSeed(hashLabel(seedString));
                const rings = buildPrintableRings(combinedYears, wigglePerm);
                const first = combinedYears[0];

                const scale = 0.48;
                const tx = 300 - RING_CENTER * scale;
                const ty = 434 - RING_CENTER * scale;

                return (
                  <g clipPath="url(#flap-clip-bottom)">
                    <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
                      {rings.map((ring) => (
                        <path
                          key={ring.year}
                          d={ring.d}
                          fill={ring.color}
                          stroke="#2a2418"
                          strokeWidth={0.35}
                          strokeLinejoin="round"
                        />
                      ))}

                      {/* Center label inside the rings */}
                      <text
                        x={RING_CENTER}
                        y={RING_CENTER - 3}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#3d3020"
                        fontSize={10}
                        fontWeight={600}
                      >
                        {first?.year}
                      </text>
                      <text
                        x={RING_CENTER}
                        y={RING_CENTER + 11}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#3d302099"
                        fontSize={8}
                        className="tabular-nums"
                      >
                        {first ? `${first.precipMm} mm` : ""}
                      </text>
                    </g>
                  </g>
                );
              })()
            : null}

          {/* Corner element tiles */}
          {CORNERS.map((c) => (
            <image
              key={c.href}
              href={c.href}
              x={c.x}
              y={c.y}
              width={TILE}
              height={TILE}
            />
          ))}

          {/* Arm labels (along the diamond edge) + per-kundli values (toward the tile) */}
          {ARMS.map((arm) => {
            const value = armValue(arm.label, data, birthPlace);
            const [vx, vy] = valueAnchor(arm.cx, arm.cy, arm.rot);
            const vlh = 13;
            const vStart = -((value.length - 1) * vlh) / 2;
            return (
              <g key={`arm-${arm.label}`}>
                <text
                  x={arm.cx}
                  y={arm.cy}
                  transform={`rotate(${arm.rot} ${arm.cx} ${arm.cy})`}
                  fill="white"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily={ARM_FONT}
                  fontWeight={400}
                  fontSize={8}
                  letterSpacing="0.05em"
                  style={{ textTransform: "uppercase" }}
                >
                  {arm.label}
                </text>
                {value.length ? (
                  <g
                    clipPath={`url(#arm-clip-${arm.label.replace(/\s+/g, "-")})`}
                  >
                    <text
                      x={vx}
                      y={vy}
                      transform={`rotate(${arm.rot} ${vx} ${vy})`}
                      fill="white"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontFamily={VALUE_FONT}
                      fontWeight={500}
                      fontSize={11}
                    >
                      {value.map((line, i) => (
                        <tspan key={line} x={vx} dy={i === 0 ? vStart : vlh}>
                          {truncate(line)}
                        </tspan>
                      ))}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {/* Top flap centered heading (dynamic with count N) */}
          {(() => {
            const N = data.hottestYears?.blades?.length ?? 0;
            return (
              <g>
                {/* Large bold number N */}
                <text
                  x={300}
                  y={58}
                  fill="black"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily={VALUE_FONT}
                  fontWeight={700}
                  fontSize={15}
                >
                  {N}
                </text>
                {/* Heading label lines */}
                <text
                  x={300}
                  y={74}
                  fill="black"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily={FLAP_FONT}
                  fontWeight={400}
                  fontSize={9}
                  letterSpacing="0.1em"
                  style={{ textTransform: "uppercase" }}
                >
                  RECORD HOT YEARS
                </text>
                <text
                  x={300}
                  y={85}
                  fill="black"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily={FLAP_FONT}
                  fontWeight={400}
                  fontSize={9}
                  letterSpacing="0.1em"
                  style={{ textTransform: "uppercase" }}
                >
                  EXPERIENCED
                </text>
              </g>
            );
          })()}

          {/* Centered flap headings */}
          {FLAP_HEADINGS.map((h) => {
            const lh = 11;
            const startY = h.cy - ((h.lines.length - 1) * lh) / 2;
            return (
              <text
                key={h.lines.join("-")}
                x={h.cx}
                y={startY}
                fill="black"
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily={FLAP_FONT}
                fontWeight={400}
                fontSize={9}
                letterSpacing="0.1em"
                style={{ textTransform: "uppercase" }}
              >
                {h.lines.map((line, i) => (
                  <tspan key={line} x={h.cx} dy={i === 0 ? 0 : lh}>
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })}

          {/* Edge-aligned flap headings */}
          {EDGE_LABELS.map((el) => (
            <text
              key={el.label}
              x={el.cx}
              y={el.cy}
              transform={`rotate(${el.rot} ${el.cx} ${el.cy})`}
              fill="black"
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily={FLAP_FONT}
              fontWeight={400}
              fontSize={9}
              letterSpacing="0.1em"
              style={{ textTransform: "uppercase" }}
            >
              {el.label}
            </text>
          ))}
        </svg>
      </div>

      {/* Bottom strip: dotted top border marks where it starts. Concise upaay on
          the left; name write-on line + QR on the right. */}
      <div className="w-full flex-1 bg-white flex flex-row items-start justify-between gap-6 p-4 border-t border-dashed border-black/60">
        {/* Concise, satirical remedies — trimmed to one line each so they never overflow. */}
        <div className="flex flex-1 flex-col">
          <span
            className="mb-1.5 text-[9px] uppercase tracking-[0.2em] text-neutral-500"
            style={{ fontFamily: "var(--font-alegreya-sans)" }}
          >
            Your upaay
          </span>
          <ul className="flex flex-col gap-1">
            {buildRemedies(data)
              .slice(0, 4)
              .map((remedy, i) => (
                <li
                  key={remedy.title}
                  className="flex gap-1.5 text-[10px] leading-snug text-black"
                  style={{ fontFamily: "var(--font-alegreya)" }}
                >
                  <span className="text-neutral-500">{i + 1}.</span>
                  <span className="line-clamp-2">{remedy.short}</span>
                </li>
              ))}
          </ul>
        </div>
        {shareUrl ? (
          <div className="flex shrink-0 flex-col items-center gap-3">
            {/* Blank write-on line, matched to the QR width, for a visitor's name. */}
            <div className="w-full flex flex-col gap-1">
              <span
                className="text-[8px] uppercase tracking-wider text-neutral-500"
                style={{ fontFamily: "var(--font-alegreya-sans)" }}
              >
                Name
              </span>
              <div className="border-b border-neutral-400" />
            </div>
            <PrintQrCode url={shareUrl} />
            <span
              className="text-center text-[8px] uppercase tracking-wider text-black"
              style={{ fontFamily: "var(--font-alegreya-sans)" }}
            >
              Scan to view your full kundli
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
