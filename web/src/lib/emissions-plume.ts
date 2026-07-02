import type { IndiaEmissionsRings } from "@/lib/api";

// Shared geometry for the carbon-emissions "matchstick smoke" streamgraph, used by
// both the interactive EmissionsRingsChart and the static print EmissionsPlume.
// All coordinates are in a 400x400 space whose diamond is 200,12 388,200 200,388 12,200.

export const EMISSIONS_SIZE = 400;
export const EMISSIONS_DIAMOND_POINTS = "200,12 388,200 200,388 12,200";
export const EMISSIONS_MATCHSTICK = { x: 162.5, y: 200, width: 75, height: 260 };

export const EMISSIONS_CATEGORIES = [
  { key: "coalMt", label: "Coal", color: "#5c0606" },
  { key: "oilMt", label: "Oil", color: "#cc1111" },
  { key: "cementMt", label: "Cement", color: "#e65100" },
  { key: "gasMt", label: "Gas", color: "#ff9800" },
  { key: "flaringMt", label: "Flaring", color: "#ffe082" },
] as const;

function getForwardCurveSegments(points: { x: number; y: number }[]): string {
  const N = points.length;
  if (N < 2) return "";
  let d = "";
  const tension = 0.25;
  for (let i = 0; i < N - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(N - 1, i + 2)]!;

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

function getBackwardCurveSegments(points: { x: number; y: number }[]): string {
  return getForwardCurveSegments([...points].reverse());
}

export type EmissionsCoord = {
  year: number;
  y: number;
  x: number[];
  values: { coalMt: number; oilMt: number; cementMt: number; gasMt: number; flaringMt: number };
  co2Mt: number;
};

export type EmissionsPath = { key: string; label: string; color: string; d: string };

export function buildEmissionsPlume(data: IndiaEmissionsRings): {
  coords: EmissionsCoord[];
  paths: EmissionsPath[];
} {
  const years = data.years ?? [];
  const N = years.length;

  // Smoke starts at y=310 (match head) and ends at y=12 (top vertex of the diamond).
  const coords: EmissionsCoord[] = (() => {
    if (N === 0) return [];
    const y_start = 310;
    const y_end = 12;
    const maxTotal = Math.max(
      ...years.map((y) => (y.coalMt ?? 0) + (y.oilMt ?? 0) + (y.cementMt ?? 0) + (y.gasMt ?? 0) + (y.flaringMt ?? 0)),
    );
    // Max width 130px (half-width 65) so it stays inside the diamond.
    const baseScale = 130 / (maxTotal || 1);

    return years.map((pt, i) => {
      const y = N > 1 ? y_start - (i / (N - 1)) * (y_start - y_end) : y_start;
      const cx = 200;
      // Pinch the smoke narrow at the match tip.
      const taper = Math.min(1.0, (y_start - y) / 25);
      const scale = baseScale * Math.max(0.08, taper);

      const w_coal = (pt.coalMt ?? 0) * scale;
      const w_oil = (pt.oilMt ?? 0) * scale;
      const w_cement = (pt.cementMt ?? 0) * scale;
      const w_gas = (pt.gasMt ?? 0) * scale;
      const w_flaring = (pt.flaringMt ?? 0) * scale;
      const W = w_coal + w_oil + w_cement + w_gas + w_flaring;

      const x0 = cx - W / 2;
      const x1 = x0 + w_coal;
      const x2 = x1 + w_oil;
      const x3 = x2 + w_cement;
      const x4 = x3 + w_gas;
      const x5 = x4 + w_flaring;

      return {
        year: pt.year,
        y,
        x: [x0, x1, x2, x3, x4, x5],
        values: {
          coalMt: pt.coalMt ?? 0,
          oilMt: pt.oilMt ?? 0,
          cementMt: pt.cementMt ?? 0,
          gasMt: pt.gasMt ?? 0,
          flaringMt: pt.flaringMt ?? 0,
        },
        co2Mt: pt.co2Mt,
      };
    });
  })();

  const paths: EmissionsPath[] = EMISSIONS_CATEGORIES.map((cat, j) => {
    const leftPoints = coords.map((c) => ({ x: c.x[j]!, y: c.y }));
    const rightPoints = coords.map((c) => ({ x: c.x[j + 1]!, y: c.y }));

    if (leftPoints.length === 0) {
      return { key: cat.key, label: cat.label, color: cat.color, d: "" };
    }

    const p0 = leftPoints[0]!;
    const forward = getForwardCurveSegments(leftPoints);
    const pTop = rightPoints[rightPoints.length - 1]!;
    const backward = getBackwardCurveSegments(rightPoints);

    const d = `M ${p0.x.toFixed(2)},${p0.y.toFixed(2)} ${forward} L ${pTop.x.toFixed(2)},${pTop.y.toFixed(2)} ${backward} Z`;
    return { key: cat.key, label: cat.label, color: cat.color, d };
  });

  return { coords, paths };
}
