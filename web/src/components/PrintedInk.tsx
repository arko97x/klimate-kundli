import { useId, type ComponentProps } from "react";

import { LINEN_DEFAULT_TILE_SIZE } from "@/components/LinenPaper";
import { cn } from "@/lib/utils";

// Paper "tooth": the same fibre noise LinenPaper uses (same filter and seed, so
// it lines up with the paper grain when the tile sizes match), recoloured to
// white with alpha taken from the lit highlights, plus the warp/weft threads in
// white. Laid over ink it shows as pale flecks where ink skipped the fibres;
// over bare paper it's white, which the multiply blend below makes invisible.
const TOOTH_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><filter id='tooth' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' seed='4' result='noise'/><feGaussianBlur in='noise' stdDeviation='0.15' result='softNoise'/><feDiffuseLighting in='softNoise' surfaceScale='0.7' lighting-color='white' result='light'><feDistantLight azimuth='135' elevation='50'/></feDiffuseLighting><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3 0 0 0 -2.1'/></filter><pattern id='warp' width='4' height='4' patternUnits='userSpaceOnUse' patternTransform='rotate(-7)'><rect width='1' height='4' fill='#ffffff' fill-opacity='0.35'/></pattern><pattern id='weft' width='4' height='4' patternUnits='userSpaceOnUse' patternTransform='rotate(83)'><rect width='1' height='4' fill='#ffffff' fill-opacity='0.25'/></pattern></defs><rect width='100%' height='100%' filter='url(#tooth)'/><rect width='100%' height='100%' fill='url(#warp)'/><rect width='100%' height='100%' fill='url(#weft)'/></svg>`;
const TOOTH_URL = `url("data:image/svg+xml,${encodeURIComponent(TOOTH_SVG)}")`;

type PrintedInkProps = ComponentProps<"div"> & {
  /** How much paper shows through the ink, 0–1. */
  tooth?: number;
  /** Edge roughness in px, as ink wicking into fibres. 0 for crisp edges. */
  bleed?: number;
  /** Match the LinenPaper tileSize underneath so the grain lines up. */
  tileSize?: number;
};

/**
 * Makes its children look printed onto the paper behind them: colours multiply
 * into the paper (white becomes "no ink"), the paper's tooth shows through
 * solid areas, and edges pick up a slight ink spread.
 *
 * Place it inside a LinenPaper with no stacking context in between (no
 * z-index, opacity, transform or filter on intermediate wrappers), or the
 * multiply blend has no paper to blend with.
 */
export function PrintedInk({
  tooth = 0.35,
  bleed = 1.2,
  tileSize = LINEN_DEFAULT_TILE_SIZE,
  className,
  children,
  ...props
}: PrintedInkProps) {
  const filterId = `ink-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div className={cn("relative mix-blend-multiply", className)} {...props}>
      {bleed > 0 && (
        <svg aria-hidden width="0" height="0" className="absolute">
          <filter id={filterId}>
            <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={bleed * 2} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      <div
        className="relative h-full w-full"
        style={bleed > 0 ? { filter: `url(#${filterId})` } : undefined}
      >
        {children}
      </div>
      {tooth > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: TOOTH_URL,
            backgroundSize: `${tileSize}px ${tileSize}px`,
            backgroundRepeat: "repeat",
            opacity: tooth,
          }}
        />
      )}
    </div>
  );
}
