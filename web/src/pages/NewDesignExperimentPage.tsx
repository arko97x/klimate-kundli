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

const CORNERS = [
  { href: fireCorner, x: 0, y: 0 },
  { href: airCorner, x: 450, y: 0 },
  { href: earthCorner, x: 0, y: 450 },
  { href: waterCorner, x: 450, y: 450 },
];

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

// Four central flaps (white), each a diamond-oriented square. Headings are upright
// and centered; line breaks are hand-tuned so they read well inside the diamond.
const FLAPS = [
  {
    pts: "300,0 450,150 300,300 150,150",
    cx: 300,
    cy: 62,
    fontSize: 9,
    lines: ["RECORD HOT YEARS", "EXPERIENCED"],
  },
  {
    pts: "300,300 450,450 300,600 150,450",
    cx: 300,
    cy: 540,
    fontSize: 9,
    lines: ["MONSOONS", "EXPERIENCED"],
  },
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
      {/* A4 page: the square crease-map on top, an empty strip below. */}
      <div className="h-full max-h-full max-w-full aspect-[210/297] bg-white shadow-sm flex flex-col relative select-none">
        <div className="w-full aspect-square relative bg-white">
          <svg
            viewBox="0 0 600 600"
            className="w-full h-full"
            style={{ display: "block" }}
          >
            {/* Black star-arms (fill the region between corner tiles and the diamond). */}
            {ARMS.map((arm) => (
              <polygon key={arm.label} points={arm.pts} fill="black" />
            ))}

            {/* White center flaps with a black gutter between them. */}
            {FLAPS.map((flap) => (
              <polygon
                key={flap.lines.join("-")}
                points={flap.pts}
                fill="white"
                stroke="black"
                strokeWidth={4}
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
                width={150}
                height={150}
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
