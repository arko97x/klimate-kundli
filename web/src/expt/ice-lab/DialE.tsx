import { SAMPLE } from './sample'
import { ICE } from './ice-shapes'

// E · Radial "ice lost" dial. Full ring = your birthday ice; the faded missing arc is the share
// melted since birth (lost / birth ≈ 31%). On-brand with the orbit/ring charts.
const R = 70
const CIRC = 2 * Math.PI * R

export function DialE() {
  const lostFrac = SAMPLE.lostMkm2 / SAMPLE.birthWindow.extentMkm2 // ≈ 0.305

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label="Ice lost dial">
      <rect x="0" y="0" width="200" height="200" fill={ICE.water} />
      <g transform="rotate(-90 100 100)">
        {/* melted arc (faded) */}
        <circle
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke={ICE.ghostLine}
          strokeWidth="16"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset="0"
          opacity="0.35"
        />
        {/* remaining ice arc */}
        <circle
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke={ICE.iceLight}
          strokeWidth="16"
          strokeDasharray={`${CIRC * (1 - lostFrac)} ${CIRC}`}
          strokeLinecap="round"
        />
      </g>
      <text x="100" y="96" textAnchor="middle" fontSize="26" fill={ICE.iceLight} fontWeight="700">
        {Math.round(lostFrac * 100)}%
      </text>
      <text x="100" y="116" textAnchor="middle" fontSize="9" fill={ICE.iceMid}>
        of your birthday ice
      </text>
      <text x="100" y="128" textAnchor="middle" fontSize="9" fill={ICE.iceMid}>
        already gone
      </text>
    </svg>
  )
}
