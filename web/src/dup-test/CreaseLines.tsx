import { TwinklingStar } from './TwinklingStar'

// The live wizard's ambient stars: [left, top, width, colour], as fractions of
// the viewport.
const STARS: [string, string, string, string][] = [
  ['58%', '10%', '4%', 'text-neutral-400'],
  ['65%', '18%', '3%', 'text-neutral-300'],
  ['88%', '38%', '3.5%', 'text-neutral-300'],
  ['9%', '78%', '4.5%', 'text-neutral-400'],
  ['70%', '86%', '3.2%', 'text-neutral-300'],
]

/**
 * The kundli-chart crease grid and ambient stars from the live wizard steps
 * (see KundliWizardLayout / KundliCreaseBackground), without the white fill so
 * the linen paper shows through; the stars twinkle (needs TWINKLE_CSS). Fixed
 * to the viewport so it stays put while the question scrolls. Sits at -z-10
 * inside the flow's isolated paper, above the paper texture and below content.
 */
export function CreaseLines() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <svg className="absolute inset-0 h-full w-full fill-none stroke-neutral-200" style={{ strokeWidth: 1.2 }}>
        {/* Full vertical lines */}
        <line x1="0" y1="0" x2="0" y2="100%" />
        <line x1="25%" y1="0" x2="25%" y2="100%" />
        <line x1="50%" y1="0" x2="50%" y2="100%" />
        <line x1="75%" y1="0" x2="75%" y2="100%" />
        <line x1="100%" y1="0" x2="100%" y2="100%" />

        {/* Full horizontal lines */}
        <line x1="0" y1="0" x2="100%" y2="0" />
        <line x1="0" y1="50%" x2="100%" y2="50%" />
        <line x1="0" y1="100%" x2="100%" y2="100%" />

        {/* Partial horizontal lines */}
        <line x1="0" y1="25%" x2="25%" y2="25%" />
        <line x1="75%" y1="25%" x2="100%" y2="25%" />
        <line x1="0" y1="75%" x2="25%" y2="75%" />
        <line x1="75%" y1="75%" x2="100%" y2="75%" />

        {/* Main diagonals */}
        <line x1="0" y1="0" x2="100%" y2="100%" />
        <line x1="100%" y1="0" x2="0" y2="100%" />

        {/* Outer diamond */}
        <line x1="50%" y1="0" x2="0" y2="50%" />
        <line x1="50%" y1="0" x2="100%" y2="50%" />
        <line x1="50%" y1="100%" x2="0" y2="50%" />
        <line x1="50%" y1="100%" x2="100%" y2="50%" />

        {/* Inner diamond */}
        <line x1="25%" y1="50%" x2="50%" y2="25%" />
        <line x1="50%" y1="25%" x2="75%" y2="50%" />
        <line x1="75%" y1="50%" x2="50%" y2="75%" />
        <line x1="50%" y1="75%" x2="25%" y2="50%" />

        {/* Diagonals in middle-left and middle-right */}
        <line x1="0" y1="25%" x2="25%" y2="50%" />
        <line x1="0" y1="75%" x2="25%" y2="50%" />
        <line x1="100%" y1="25%" x2="75%" y2="50%" />
        <line x1="100%" y1="75%" x2="75%" y2="50%" />

        {/* Corner diagonals */}
        <line x1="0" y1="25%" x2="25%" y2="0" />
        <line x1="75%" y1="0" x2="100%" y2="25%" />
        <line x1="0" y1="75%" x2="25%" y2="100%" />
        <line x1="75%" y1="100%" x2="100%" y2="75%" />
      </svg>

      {STARS.map(([left, top, width, color], i) => (
        <TwinklingStar key={`${left}-${top}`} index={i} className={color} style={{ left, top, width }} />
      ))}
    </div>
  )
}
