import type { ComponentProps } from "react";

// "Linen paper" texture (#29) from https://codepen.io/ol-ivier/pen/raWowqp.
// A tiling SVG: flat base colour, two faint thread patterns (warp at -7°,
// weft at 83°) and a diffuse-lit noise layer for the fibre grain.
function linenSvg(color: string) {
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><filter id='fabric'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' seed='4' result='noise'/><feGaussianBlur in='noise' stdDeviation='0.15' result='softNoise'/><feDiffuseLighting in='softNoise' surfaceScale='0.7' lighting-color='white' result='light'><feDistantLight azimuth='135' elevation='50'/></feDiffuseLighting></filter><pattern id='warp' width='4' height='4' patternUnits='userSpaceOnUse' patternTransform='rotate(-7)'><rect width='1' height='4' fill='#ffffff' fill-opacity='0.045'/><rect x='2' width='1' height='4' fill='#000000' fill-opacity='0.025'/></pattern><pattern id='weft' width='4' height='4' patternUnits='userSpaceOnUse' patternTransform='rotate(83)'><rect width='1' height='4' fill='#ffffff' fill-opacity='0.03'/><rect x='2' width='1' height='4' fill='#000000' fill-opacity='0.015'/></pattern></defs><rect width='100%' height='100%' fill='${color}'/><rect width='100%' height='100%' fill='url(#warp)'/><rect width='100%' height='100%' fill='url(#weft)'/><rect width='100%' height='100%' filter='url(#fabric)' opacity='0.25'/></svg>`;
}

export const LINEN_DEFAULT_COLOR = "#faf8f3";
export const LINEN_DEFAULT_TILE_SIZE = 300;

type LinenPaperProps = ComponentProps<"div"> & {
  /** Base paper colour. Any CSS colour the SVG accepts. */
  color?: string;
  /** Size of one repeating tile, in px. */
  tileSize?: number;
};

/**
 * A div painted with a linen paper texture. Size and position it with
 * className: wrap content in it, or use `fixed inset-0 -z-10` as a page backdrop.
 */
export function LinenPaper({
  color = LINEN_DEFAULT_COLOR,
  tileSize = LINEN_DEFAULT_TILE_SIZE,
  className,
  style,
  ...props
}: LinenPaperProps) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: color,
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(linenSvg(color))}")`,
        backgroundSize: `${tileSize}px ${tileSize}px`,
        backgroundRepeat: "repeat",
        ...style,
      }}
      {...props}
    />
  );
}
