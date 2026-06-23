import { SAMPLE, SERIES } from './sample'
import { ICE } from './ice-shapes'

// D · Lifetime ice-stripes (warming-stripes, for ice). One bar per year 1979→now, white = more ice,
// deep teal = less. Birth year and now are flagged. Shows the whole arc, not just two endpoints.
const W = 200
const H = 120
const TOP = 14
const BOT = 96

function iceColor(t: number): string {
  // t: 0 = least ice (teal), 1 = most ice (near white)
  const c1 = [12, 64, 92] // deep teal
  const c2 = [234, 247, 252] // ice white
  const mix = c1.map((a, i) => Math.round(a + (c2[i]! - a) * t))
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`
}

export function StripesD() {
  const values = SERIES.map(([, v]) => v)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const bw = W / SERIES.length

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Lifetime sea-ice stripes">
      <rect x="0" y="0" width={W} height={H} fill={ICE.waterDeep} />
      {SERIES.map(([year, v], i) => (
        <rect
          key={year}
          x={i * bw}
          y={TOP}
          width={bw + 0.5}
          height={BOT - TOP}
          fill={iceColor((v - min) / (max - min))}
        />
      ))}

      {[
        { year: SAMPLE.birthYear, label: `born ${SAMPLE.birthYear}` },
        { year: 2025, label: 'now' },
      ].map(({ year, label }) => {
        const i = SERIES.findIndex(([y]) => y === year)
        const x = i * bw + bw / 2
        const isLast = i >= SERIES.length - 2
        return (
          <g key={year}>
            <line x1={x} y1={TOP} x2={x} y2={BOT + 4} stroke={ICE.iceLight} strokeWidth="0.8" />
            <text
              x={isLast ? W - 1 : x}
              y={BOT + 13}
              textAnchor={isLast ? 'end' : 'middle'}
              fontSize="7"
              fill={ICE.iceLight}
            >
              {label}
            </text>
          </g>
        )
      })}
      <text x="2" y="10" fontSize="6.5" fill={ICE.iceShadow}>
        ← more ice · 1979
      </text>
      <text x={W - 2} y="10" textAnchor="end" fontSize="6.5" fill={ICE.iceShadow}>
        less ice →
      </text>
    </svg>
  )
}
