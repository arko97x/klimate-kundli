const Star = ({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) => (
  <svg viewBox="0 0 105 116" fill="currentColor" className={className} style={style}>
    <path d="M51.4613 0.894527C51.587 -0.299218 53.3247 -0.299226 53.4503 0.894519L58.6314 50.1116C58.6797 50.5706 59.0359 50.937 59.4933 50.9981L104.044 56.9561C105.201 57.1108 105.201 58.7838 104.044 58.9384L59.4933 64.8964C59.0359 64.9576 58.6797 65.3239 58.6314 65.7829L53.4503 115C53.3247 116.194 51.587 116.194 51.4613 115L46.2803 65.7829C46.2319 65.3239 45.8758 64.9576 45.4183 64.8964L0.867378 58.9384C-0.289217 58.7838 -0.289214 57.1108 0.867381 56.9561L45.4183 50.9981C45.8758 50.937 46.2319 50.5706 46.2803 50.1116L51.4613 0.894527Z" />
  </svg>
)

/**
 * The kundli-crease grid backdrop used on the data-collection pages, rendered
 * as a fixed, non-interactive layer so scrolling content sits on top of it.
 */
export function KundliCreaseBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 h-full w-full bg-white" aria-hidden>
      <svg className="h-full w-full fill-none stroke-neutral-200" style={{ strokeWidth: 1.2 }}>
        {/* Full Vertical lines */}
        <line x1="0" y1="0" x2="0" y2="100%" />
        <line x1="25%" y1="0" x2="25%" y2="100%" />
        <line x1="50%" y1="0" x2="50%" y2="100%" />
        <line x1="75%" y1="0" x2="75%" y2="100%" />
        <line x1="100%" y1="0" x2="100%" y2="100%" />

        {/* Full Horizontal lines */}
        <line x1="0" y1="0" x2="100%" y2="0" />
        <line x1="0" y1="50%" x2="100%" y2="50%" />
        <line x1="0" y1="100%" x2="100%" y2="100%" />

        {/* Partial Horizontal lines */}
        <line x1="0" y1="25%" x2="25%" y2="25%" />
        <line x1="75%" y1="25%" x2="100%" y2="25%" />
        <line x1="0" y1="75%" x2="25%" y2="75%" />
        <line x1="75%" y1="75%" x2="100%" y2="75%" />

        {/* Main Diagonals */}
        <line x1="0" y1="0" x2="100%" y2="100%" />
        <line x1="100%" y1="0" x2="0" y2="100%" />

        {/* Outer Diamond */}
        <line x1="50%" y1="0" x2="0" y2="50%" />
        <line x1="50%" y1="0" x2="100%" y2="50%" />
        <line x1="50%" y1="100%" x2="0" y2="50%" />
        <line x1="50%" y1="100%" x2="100%" y2="50%" />

        {/* Inner Diamond */}
        <line x1="25%" y1="50%" x2="50%" y2="25%" />
        <line x1="50%" y1="25%" x2="75%" y2="50%" />
        <line x1="75%" y1="50%" x2="50%" y2="75%" />
        <line x1="50%" y1="75%" x2="25%" y2="50%" />

        {/* Diagonals in middle-left and middle-right */}
        <line x1="0" y1="25%" x2="25%" y2="50%" />
        <line x1="0" y1="75%" x2="25%" y2="50%" />
        <line x1="100%" y1="25%" x2="75%" y2="50%" />
        <line x1="100%" y1="75%" x2="75%" y2="50%" />

        {/* Corner Diagonals */}
        <line x1="0" y1="25%" x2="25%" y2="0" />
        <line x1="75%" y1="0" x2="100%" y2="25%" />
        <line x1="0" y1="75%" x2="25%" y2="100%" />
        <line x1="75%" y1="100%" x2="100%" y2="75%" />
      </svg>

      {/* Ambient stars, matching the wizard step background */}
      <Star className="absolute -translate-x-1/2 -translate-y-1/2 text-neutral-400" style={{ left: '58%', top: '10%', width: '4%' }} />
      <Star className="absolute -translate-x-1/2 -translate-y-1/2 text-neutral-300" style={{ left: '65%', top: '18%', width: '3%' }} />
      <Star className="absolute -translate-x-1/2 -translate-y-1/2 text-neutral-300" style={{ left: '88%', top: '38%', width: '3.5%' }} />
      <Star className="absolute -translate-x-1/2 -translate-y-1/2 text-neutral-400" style={{ left: '9%', top: '78%', width: '4.5%' }} />
      <Star className="absolute -translate-x-1/2 -translate-y-1/2 text-neutral-300" style={{ left: '70%', top: '86%', width: '3.2%' }} />
    </div>
  )
}
