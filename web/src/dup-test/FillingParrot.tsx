import parrotStep1Svg from '@/assets/parrot-step1.svg?raw'
import { cn } from '@/lib/utils'

// The parrot on its crystal ball (parrot-step1.svg) with liquid rising inside
// the ball as the visitor progresses. The SVG is inlined so the liquid can sit
// in its paint order right after the ball's white fill: under the ball's
// outline and under the parrot's feet, which rest inside the ball's top when
// it's nearly full. The liquid reuses parrot-step2.svg's wave and gradient.

// Split the artwork around its first element, the ball's white fill.
const SVG_BODY = parrotStep1Svg.slice(parrotStep1Svg.indexOf('>') + 1, parrotStep1Svg.lastIndexOf('</svg>'))
const BALL_FILL_END = SVG_BODY.indexOf('/>') + 2
const BALL_FILL = SVG_BODY.slice(0, BALL_FILL_END)
const ARTWORK_ABOVE = SVG_BODY.slice(BALL_FILL_END)

// Ball geometry in the SVG's 280×432 space.
const BALL_CX = 130.844
const BALL_CY = 302.548
const BALL_R = 94.5
const BALL_BOTTOM = BALL_CY + BALL_R
/** Where parrot-step2's wave surface sits, roughly. */
const WAVE_SURFACE_Y = 300

// parrot-step2's liquid surface (the lower edge of its white cover shape),
// closed off far enough below that the body still fills the ball when the
// surface is raised near the top.
const LIQUID_PATH =
  'M225.344 302.548C225.344 327.729 209.048 284.048 186.548 294.548C166.048 306.548 151.548 308.109 136.048 300.548C115.548 290.548 83.5478 290.048 61.5478 306.548C39.0476 319.548 36.3438 328.99 36.3438 302.548L36 700L226 700Z'

// parrot-step2's gradient span, in ball coordinates.
const GRADIENT_TOP = 208.048
const GRADIENT_BOTTOM = 431.254

type FillingParrotProps = {
  /** How full the ball is, 0 (empty) to 1. parrot-step2's art is about 0.5. */
  level: number
  className?: string
}

export function FillingParrot({ level, className }: FillingParrotProps) {
  const surfaceY = BALL_BOTTOM - level * BALL_R * 2
  const shift = level <= 0 ? BALL_R * 2 : surfaceY - WAVE_SURFACE_Y

  return (
    <svg viewBox="0 0 280 432" fill="none" aria-hidden className={cn('block h-auto', className)}>
      <g dangerouslySetInnerHTML={{ __html: BALL_FILL }} />
      <defs>
        <clipPath id="dup-ball-clip">
          <circle cx={BALL_CX} cy={BALL_CY} r={BALL_R} />
        </clipPath>
        {/* The gradient lives in the moving path's coordinates; offsetting it by
            the shift pins it to the ball, as in parrot-step2's art. */}
        <linearGradient
          id="dup-ball-liquid"
          x1={BALL_CX}
          y1={GRADIENT_TOP - shift}
          x2={BALL_CX}
          y2={GRADIENT_BOTTOM - shift}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.389423" stopColor="#90085C" />
          <stop offset="0.841346" stopColor="#420261" />
          <stop offset="1" stopColor="#2A021B" />
        </linearGradient>
      </defs>
      <g clipPath="url(#dup-ball-clip)">
        <path
          d={LIQUID_PATH}
          fill="url(#dup-ball-liquid)"
          className="transition-transform duration-700 ease-out motion-reduce:transition-none"
          style={{ transform: `translateY(${shift}px)` }}
        />
      </g>
      <g dangerouslySetInnerHTML={{ __html: ARTWORK_ABOVE }} />
    </svg>
  )
}
