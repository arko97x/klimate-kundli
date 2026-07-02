import matchstickImg from "@/assets/matchstick.png";
import type { IndiaEmissionsRings } from "@/lib/api";
import { EMISSIONS_MATCHSTICK, buildEmissionsPlume } from "@/lib/emissions-plume";

// Static (non-interactive) carbon-emissions plume in 400x400 diamond space: the
// matchstick image plus the streamgraph "smoke" ribbons. Returns raw SVG elements
// (no <svg> wrapper) so a parent SVG can position/scale/clip it into a flap.
export function EmissionsPlume({ data }: { data: IndiaEmissionsRings }) {
  const { paths } = buildEmissionsPlume(data);
  return (
    <>
      <image
        href={matchstickImg}
        x={EMISSIONS_MATCHSTICK.x}
        y={EMISSIONS_MATCHSTICK.y}
        width={EMISSIONS_MATCHSTICK.width}
        height={EMISSIONS_MATCHSTICK.height}
      />
      {paths.map((p) => (
        <path key={p.key} d={p.d} fill={p.color} stroke={p.color} strokeWidth={0.5} opacity={0.85} />
      ))}
    </>
  );
}
