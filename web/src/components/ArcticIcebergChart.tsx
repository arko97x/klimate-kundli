import type { ArcticIce } from '@/lib/api'

// Iceberg silhouette taken from src/assets/iceberg-outline.svg (viewBox 180×184). We use it as a
// clip path and split it with a horizontal melt line into a ghosted "melted" cap and a solid
// "today" body. Only that split line is data-driven; the shape is the supplied outline.
const BERG =
  'M14.5503 145.574L0.550293 105.574L12.7891 85.5742L21.0503 72.0742L27.5503 57.5742' +
  'L38.5503 53.5742L45.0503 20.5742L77.0503 0.574219L101.55 13.0742L139.05 55.5742' +
  'L169.55 72.0742V105.574L178.55 121.574L152.55 152.574L89.0503 183.074L14.5503 145.574Z'

const VB_W = 180
const VB_H = 184
const TOP = 1
const BOTTOM = 183

export function ArcticIcebergChart({ arctic }: { arctic: ArcticIce }) {
  const birthExtent = arctic.birthWindow.extentMkm2
  // Fraction of the birth-year berg that has melted away → height of the ghosted cap.
  const meltFrac =
    birthExtent > 0 ? Math.min(0.85, Math.max(0.06, arctic.lostMkm2 / birthExtent)) : 0
  const meltLine = TOP + meltFrac * (BOTTOM - TOP)

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="h-auto w-full max-w-[220px]"
      role="img"
      aria-label={`Iceberg: the ghosted cap is Arctic sea ice melted since ${arctic.birthWindow.startYear}; the solid berg is what remains today.`}
    >
      <defs>
        <clipPath id="kkBergClip">
          <path d={BERG} />
        </clipPath>
        <linearGradient id="kkBergFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bfe3f0" />
          <stop offset="60%" stopColor="#89b4c6" />
          <stop offset="100%" stopColor="#5f93a8" />
        </linearGradient>
      </defs>

      <g clipPath="url(#kkBergClip)">
        {/* melted since birth = ghosted cap */}
        <rect x="0" y="0" width={VB_W} height={meltLine} fill="#dde1e5" />
        {/* today = solid berg below the melt line */}
        <rect x="0" y={meltLine} width={VB_W} height={VB_H - meltLine} fill="url(#kkBergFill)" />
        {/* melt boundary, drawn only across the ice */}
        <line
          x1="0"
          y1={meltLine}
          x2={VB_W}
          y2={meltLine}
          stroke="#7c8a92"
          strokeWidth="1.4"
          strokeDasharray="4 3"
        />
      </g>

      {/* berg outline */}
      <path d={BERG} fill="none" stroke="#334155" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}
