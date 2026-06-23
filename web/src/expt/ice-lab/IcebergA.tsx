import { SAMPLE } from './sample'
import { ICE } from './ice-shapes'

// A · Iceberg cross-section. A stylised side-view berg; the faded cap above the melt line is what
// vanished since birth (lost / birth-year extent ≈ 31%), the solid berg is what's left today.
const WATERLINE = 120
const PEAK = 26

// Side-view berg silhouette (tip above water, ~85% of the mass below it).
const BERG =
  'M100 26 L118 52 L112 70 L132 96 L120 120 ' + // right side down to waterline
  'L168 132 L182 168 L150 196 L108 206 L70 200 L40 176 L34 146 L78 120 ' + // underwater mass
  'L66 96 L86 70 L82 50 Z'

export function IcebergA() {
  const meltFrac = SAMPLE.lostMkm2 / SAMPLE.birthWindow.extentMkm2 // ≈ 0.305
  const meltLine = PEAK + meltFrac * (WATERLINE - PEAK)

  return (
    <svg viewBox="0 0 200 220" className="h-full w-full" role="img" aria-label="Iceberg cross-section">
      <defs>
        <clipPath id="bergClip">
          <path d={BERG} />
        </clipPath>
        <linearGradient id="bergFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ICE.iceLight} />
          <stop offset="55%" stopColor={ICE.iceMid} />
          <stop offset="100%" stopColor={ICE.iceShadow} />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="200" height="220" fill={ICE.water} />
      {/* water below the line */}
      <rect x="0" y={WATERLINE} width="200" height={220 - WATERLINE} fill={ICE.waterDeep} />

      {/* outline of the original berg */}
      <path d={BERG} fill="none" stroke={ICE.ghostLine} strokeWidth="0.8" strokeDasharray="3 3" />

      <g clipPath="url(#bergClip)">
        {/* melted cap = the berg above the melt line, clearly ghosted */}
        <rect x="0" y="0" width="200" height={meltLine} fill="rgba(234, 247, 252, 0.3)" />
        {/* solid berg = today: below the melt line */}
        <rect x="0" y={meltLine} width="200" height={220 - meltLine} fill="url(#bergFill)" />
      </g>

      {/* melt line + drips */}
      <line x1="34" y1={meltLine} x2="166" y2={meltLine} stroke={ICE.ghostLine} strokeWidth="0.8" strokeDasharray="4 3" />
      {[80, 100, 120].map((x, i) => (
        <circle key={x} cx={x} cy={meltLine + 4 + i * 3} r={1.6 - i * 0.3} fill={ICE.ghostLine} />
      ))}

      {/* waterline */}
      <line x1="0" y1={WATERLINE} x2="200" y2={WATERLINE} stroke={ICE.teal} strokeWidth="0.8" opacity="0.6" />
      <text x="100" y={PEAK + 14} textAnchor="middle" fontSize="8" fill={ICE.water} fontWeight="600">
        melted since {SAMPLE.birthYear}
      </text>
    </svg>
  )
}
