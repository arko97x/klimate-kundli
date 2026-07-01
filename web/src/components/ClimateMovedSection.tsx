import type { ClimateMigration, ClimateMoved } from "@/lib/api";

// Past = cool blue, now = warm red — same semantics as the monthly-delta chart.
const COLOR_PAST = "#6b8eb8";
const COLOR_NOW = "#d3674a";

type ClimateMovedSectionProps = {
  data: ClimateMoved;
};

export function ClimateMovedSection({ data }: ClimateMovedSectionProps) {
  const [lead, ...rest] = data.migrations;
  if (!lead) return null;

  return (
    <section className="space-y-6 pb-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Your climate emigrated</p>
        <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          The {lead.home.name} you were born into moved {lead.distanceKm.toLocaleString()} km {lead.direction}.
        </h2>
        <p className="max-w-2xl text-pretty text-muted-foreground">
          The climate of your childhood didn&rsquo;t stay put. Today it lives somewhere else &mdash; and
          something hotter took its place.
        </p>
      </div>

      <div className="space-y-4">
        <MigrationBlock migration={lead} lead />
        {rest.map((migration) => (
          <MigrationBlock key={migration.home.displayName} migration={migration} />
        ))}
      </div>

      <p className="text-xs uppercase tracking-wider text-muted-foreground opacity-70">
        Climate analog · matched on hottest day, coldest night &amp; annual rain
      </p>
    </section>
  );
}

function MigrationBlock({ migration, lead = false }: { migration: ClimateMigration; lead?: boolean }) {
  const { home, analog, childhood, homeNow } = migration;
  const place = [analog.name, analog.admin1].filter(Boolean).join(", ");

  return (
    <div className="grid gap-5 rounded-xl border border-border bg-muted/30 p-5 sm:grid-cols-[132px_1fr] sm:items-center">
      <div className="flex flex-col items-center gap-2">
        <MigrationArrow bearingDeg={migration.bearingDeg} />
        <div className="text-center">
          <div className="font-heading text-xl font-semibold tabular-nums">
            {migration.distanceKm.toLocaleString()} km
          </div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{migration.direction}</div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-pretty">
          {lead ? "" : <span className="font-medium">{home.name}. </span>}
          The climate {home.name} had in{" "}
          <span className="font-medium" style={{ color: COLOR_PAST }}>
            {childhood.startYear}&ndash;{childhood.endYear}
          </span>{" "}
          is now the everyday normal in{" "}
          <span className="font-medium" style={{ color: COLOR_NOW }}>
            {place}
          </span>
          .
        </p>

        {homeNow ? (
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <ThenNow label="Hottest day" then={childhood.heatCeiling} now={homeNow.heatCeiling} unit="°C" />
            <ThenNow label="Coldest night" then={childhood.coldFloor} now={homeNow.coldFloor} unit="°C" />
            <ThenNow label="Yearly rain" then={childhood.wetness} now={homeNow.wetness} unit="mm" />
          </dl>
        ) : null}
      </div>
    </div>
  );
}

function ThenNow({ label, then, now, unit }: { label: string; then: number; now: number; unit: string }) {
  const delta = now - then;
  const sign = delta > 0 ? "+" : "";
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-1.5 tabular-nums">
        <span style={{ color: COLOR_PAST }}>{formatValue(then, unit)}</span>
        <span className="text-muted-foreground">&rarr;</span>
        <span style={{ color: COLOR_NOW }}>{formatValue(now, unit)}</span>
      </dd>
      <dd className="text-[11px] tabular-nums text-muted-foreground">
        {sign}
        {formatValue(delta, unit)}
      </dd>
    </div>
  );
}

function formatValue(value: number, unit: string): string {
  return unit === "mm" ? `${Math.round(value).toLocaleString()} mm` : `${value.toFixed(1)}°`;
}

/** A compass arrow pointing along the true bearing to the analog location. */
function MigrationArrow({ bearingDeg }: { bearingDeg: number }) {
  const size = 108;
  const c = size / 2;
  const r = 38;
  // Screen space: north is up. bearing 0° → (0,-1), 90° → (+1,0).
  const rad = (bearingDeg * Math.PI) / 180;
  const tipX = c + r * Math.sin(rad);
  const tipY = c - r * Math.cos(rad);
  const tailX = c - r * 0.55 * Math.sin(rad);
  const tailY = c + r * 0.55 * Math.cos(rad);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Direction ${Math.round(bearingDeg)}°`}>
      <defs>
        <marker id="cm-head" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill={COLOR_NOW} />
        </marker>
      </defs>
      <circle cx={c} cy={c} r={r + 8} fill="none" stroke="currentColor" strokeOpacity={0.12} />
      {["N", "E", "S", "W"].map((dir, i) => {
        const a = (i * 90 * Math.PI) / 180;
        return (
          <text
            key={dir}
            x={c + (r + 15) * Math.sin(a)}
            y={c - (r + 15) * Math.cos(a) + 3}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={8}
          >
            {dir}
          </text>
        );
      })}
      <circle cx={tailX} cy={tailY} r={3.5} fill={COLOR_PAST} />
      <line x1={tailX} y1={tailY} x2={tipX} y2={tipY} stroke={COLOR_NOW} strokeWidth={2.5} markerEnd="url(#cm-head)" />
    </svg>
  );
}
