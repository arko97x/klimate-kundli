import { SAMPLE } from './sample'
import { ICE } from './ice-shapes'
import { INDIA_SHAPE } from './india-shape'

// C · Your country, drowned. The birth country's outline, flooded with ice up to `multiple` of its
// area — making "N× your country" literal. (Prototype fills by height; production would fill by area
// and tile the outline when multiple > 1.)
export function CountryC() {
  const frac = Math.min(SAMPLE.comparison.multiple, 1) // India case = 0.62
  const [, , vbW, vbH] = INDIA_SHAPE.viewBox.split(' ').map(Number)
  const iceTop = vbH * (1 - frac)

  return (
    <svg viewBox={INDIA_SHAPE.viewBox} className="h-full w-full" role="img" aria-label="Country filled with lost ice">
      <defs>
        <clipPath id="countryClip">
          <path d={INDIA_SHAPE.d} />
        </clipPath>
        <linearGradient id="iceFlood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ICE.iceLight} />
          <stop offset="100%" stopColor={ICE.iceShadow} />
        </linearGradient>
      </defs>

      {/* empty country */}
      <path d={INDIA_SHAPE.d} fill={ICE.water} stroke={ICE.iceShadow} strokeWidth="0.6" />

      {/* ice flood, clipped to the country */}
      <g clipPath="url(#countryClip)">
        <rect x="0" y={iceTop} width={vbW} height={vbH - iceTop} fill="url(#iceFlood)" />
        {/* wavy ice surface */}
        <path
          d={`M0 ${iceTop} q ${vbW * 0.12} -3 ${vbW * 0.25} 0 t ${vbW * 0.25} 0 t ${vbW * 0.25} 0 t ${vbW * 0.25} 0 V${iceTop} Z`}
          fill={ICE.iceLight}
          opacity="0.7"
        />
      </g>

      <text x={vbW / 2} y={vbH / 2} textAnchor="middle" fontSize="9" fill={ICE.water} fontWeight="700">
        {Math.round(frac * 100)}%
      </text>
    </svg>
  )
}
