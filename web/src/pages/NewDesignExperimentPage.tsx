import { Download } from "lucide-react";

import fireCorner from "../assets/fire-corner.png";
import airCorner from "../assets/air-corner.png";
import earthCorner from "../assets/earth-corner.png";
import waterCorner from "../assets/water-corner.png";

// The printable kundli is a fortune-teller (cootie-catcher) crease map drawn on a
// 600x600 square (viewBox units). Geometry:
//   - Four 150px corner fold-squares carry the element illustrations (PNGs).
//   - The central diamond connects the four edge midpoints and is split by the
//     square's diagonals into four white "flaps".
//   - The eight black star-arms sit between the corner squares and the diamond;
//     each carries one white, rotated data-field label along its hypotenuse.

// Every piece (corner tiles, black arms, white flaps) is inset by GUTTER from
// its ideal edge, so a uniform white gutter (~2*GUTTER between neighbours, ~GUTTER
// at the outer margin) shows through the white background between all elements.
const GUTTER = 4;

// Corner tiles live in the four 150-unit fold-squares, inset by GUTTER.
const TILE = 150 - GUTTER * 2;
const CORNERS = [
  { href: fireCorner, x: GUTTER, y: GUTTER },
  { href: airCorner, x: 450 + GUTTER, y: GUTTER },
  { href: earthCorner, x: GUTTER, y: 450 + GUTTER },
  { href: waterCorner, x: 450 + GUTTER, y: 450 + GUTTER },
];

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

// Eight black arm-triangles. `cx/cy` anchors the label on the diamond-edge
// midpoint (nudged ~14px into the black arm), where the arm is widest; `rot`
// aligns the label with that edge, kept within [-45,45] so it reads upright.
const ARMS = [
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
    label: "CHANGE IN SEA LEVEL",
  },
  {
    pts: "0,300 0,150 150,150",
    cx: 65,
    cy: 215,
    rot: -45,
    label: "HIGHEST TEMPERATURE EXPERIENCED",
  },
];

// All four central flap shapes (white diamonds), drawn regardless of where their
// text sits (centered heading vs. edge-aligned label).
const FLAP_SHAPES = [
  "300,0 450,150 300,300 150,150", // top
  "450,150 600,300 450,450 300,300", // right
  "300,300 450,450 300,600 150,450", // bottom
  "150,150 300,300 150,450 0,300", // left
];

// Flaps whose heading sits centered (upright) inside the diamond. Line breaks are
// hand-tuned so they read well inside the shape.
const FLAPS = [
  { cx: 300, cy: 62, fontSize: 9, lines: ["RECORD HOT YEARS", "EXPERIENCED"] },
  { cx: 300, cy: 540, fontSize: 9, lines: ["MONSOONS", "EXPERIENCED"] },
];

// Some flap headings run as a single line along the flap's outer diamond edge
// (parallel to the neighbouring arm label) instead of sitting centered.
const EDGE_LABELS = [
  // Left flap — along its bottom-left edge, above CHANGE IN SEA LEVEL.
  { cx: 84, cy: 367, rot: 45, label: "ARCTIC ICE SUMMER MINIMUM" },
  // Right flap — along its bottom-right edge, close to OCEAN-TEMPERATURE CHANGE.
  { cx: 516, cy: 367, rot: -45, label: "ANNUAL CARBON EMISSIONS" },
];

const ARM_FONT = "var(--font-sans)";
const FLAP_FONT = "var(--font-alegreya-sans)";

export function NewDesignExperimentPage() {
  return (
    <div className="h-screen w-full bg-neutral-200 flex items-center justify-center p-0 md:p-6 font-sans overflow-hidden">
      {/* Print rules: exact A4, no margins, show only the sheet. */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          #kundli-sheet, #kundli-sheet * { visibility: visible !important; }
          #kundli-sheet {
            position: fixed; top: 0; left: 0;
            width: 210mm; height: 297mm;
            box-shadow: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <button
        type="button"
        onClick={() => window.print()}
        className="no-print fixed top-4 right-4 z-10 inline-flex items-center gap-2 rounded-md bg-black px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
      >
        <Download className="size-4" />
        Download PDF
      </button>

      {/* A4 page: the square crease-map on top, an empty strip below. */}
      <div
        id="kundli-sheet"
        className="h-full max-h-full max-w-full aspect-[210/297] bg-white shadow-sm flex flex-col relative select-none"
      >
        <div className="w-full aspect-square relative bg-white">
          <svg
            viewBox="0 0 600 600"
            className="w-full h-full"
            style={{ display: "block" }}
          >
            {/* Black star-arms, inset so white gutters open around them. */}
            {ARMS.map((arm) => (
              <polygon
                key={arm.label}
                points={insetPolygon(arm.pts, GUTTER)}
                fill="black"
              />
            ))}

            {/* White center flaps, inset with a thin outline; the white gutters
                between them and around them come from the white background. */}
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

            {/* Corner element tiles (illustration + name band baked into the PNG). */}
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

            {/* Arm labels — white, rotated along each hypotenuse. */}
            {ARMS.map((arm) => (
              <text
                key={`label-${arm.label}`}
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
            ))}

            {/* Flap headings — upright, centered, Alegreya Sans. */}
            {FLAPS.map((flap) => {
              const lh = flap.fontSize * 1.22;
              const startY = flap.cy - ((flap.lines.length - 1) * lh) / 2;
              return (
                <text
                  key={`flap-${flap.lines.join("-")}`}
                  x={flap.cx}
                  y={startY}
                  fill="black"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily={FLAP_FONT}
                  fontWeight={400}
                  fontSize={flap.fontSize}
                  letterSpacing="0.1em"
                  style={{ textTransform: "uppercase" }}
                >
                  {flap.lines.map((line, i) => (
                    <tspan key={line} x={flap.cx} dy={i === 0 ? 0 : lh}>
                      {line}
                    </tspan>
                  ))}
                </text>
              );
            })}

            {/* Flap headings aligned along a flap's outer diamond edge. */}
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

        {/* Empty bottom strip (leftover A4 paper below the folded square). */}
        <div className="w-full flex-1 bg-white" />
      </div>
    </div>
  );
}
