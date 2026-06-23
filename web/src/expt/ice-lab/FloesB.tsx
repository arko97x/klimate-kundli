import { useMemo } from 'react'

import { permutationForSeed } from '@/lib/organicTreeRing'
import { SAMPLE } from './sample'
import { ICE, organicBlobPath } from './ice-shapes'

// B · Two floes, then vs now. Outer blob = birth-window ice, inner solid = today's ice
// (radius ∝ √extent so area reads true). The cracked gap between them is what melted.
export function FloesB() {
  const perm = useMemo(() => permutationForSeed(SAMPLE.birthYear), [])
  const cx = 100
  const cy = 100
  const rOuter = 82
  const rInner = rOuter * Math.sqrt(SAMPLE.recentWindow.extentMkm2 / SAMPLE.birthWindow.extentMkm2)

  const outer = organicBlobPath(cx, cy, rOuter, perm)
  const inner = organicBlobPath(cx, cy, rInner, perm)

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label="Two ice floes">
      <defs>
        <radialGradient id="floeFill" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0%" stopColor={ICE.iceLight} />
          <stop offset="100%" stopColor={ICE.iceShadow} />
        </radialGradient>
        <pattern id="crack" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="10" stroke={ICE.teal} strokeWidth="0.5" opacity="0.5" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="200" height="200" fill={ICE.water} />

      {/* gap = melted, shown as cracked dark water */}
      <path d={`${outer} ${inner}`} fillRule="evenodd" fill={ICE.waterDeep} />
      <path d={`${outer} ${inner}`} fillRule="evenodd" fill="url(#crack)" />
      <path d={outer} fill="none" stroke={ICE.ghostLine} strokeWidth="0.8" strokeDasharray="2 3" />

      {/* today's floe */}
      <path d={inner} fill="url(#floeFill)" stroke={ICE.iceLight} strokeWidth="0.8" />

      <text x="100" y="104" textAnchor="middle" fontSize="9" fill={ICE.water} fontWeight="600">
        {SAMPLE.recentWindow.startYear}–{SAMPLE.recentWindow.endYear}
      </text>
      <text x="100" y="26" textAnchor="middle" fontSize="8" fill={ICE.ghostLine}>
        {SAMPLE.birthWindow.startYear}–{SAMPLE.birthWindow.endYear}
      </text>
    </svg>
  )
}
