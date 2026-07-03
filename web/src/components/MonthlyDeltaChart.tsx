import { useMemo, type CSSProperties, type ReactNode } from "react";

import "@/expt/stacking-cards.css";
import { ArcticIcebergChart } from "@/components/ArcticIcebergChart";
import { ClimateMovedSection } from "@/components/ClimateMovedSection";
import { EmissionsRingsChart } from "@/components/EmissionsRingsChart";
import { InsightsSection } from "@/components/InsightsSection";
// import { LifeOrbitChart } from "@/components/LifeOrbitChart"; // TEMP: "Your orbit" card disabled — see below
import { LifeTempChart } from "@/components/LifeTempChart";
import { RemediesSection } from "@/components/RemediesSection";
import { ShareQrCode } from "@/components/ShareQrCode";
import { Button } from "@/components/ui/button";
import { HandFanChart } from "@/components/HandFanChart";
import { MonthlyRainSection } from "@/components/MonthlyRainSection";
import { RainRingsChart } from "@/components/RainRingsChart";
import type { ArcticIce, MonthlyDeltaResponse } from "@/lib/api";
import { formatDataSource } from "@/lib/utils";
// import { latestCompleteYearUtc } from "@/lib/years"; // TEMP: only used by disabled "Your orbit" card
import type { LivedCity } from "@/types";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function monthName(index: number): string {
  return MONTH_NAMES[index] ?? "Unknown";
}

const COLOR_BIRTH = "#6b8eb8";
const COLOR_RECENT = "#d3674a";
const COLOR_DELTA = "#e9a560";
const COLOR_BIRTH_RANGE = "#6b8eb8";
const COLOR_RECENT_RANGE = "#d3674a";
const RANGE_BAR_WIDTH = 6;
const RANGE_BAR_OFFSET = 5;

const VIEWBOX_WIDTH = 840;
const VIEWBOX_HEIGHT = 420;
const MARGIN = { top: 32, right: 32, bottom: 56, left: 56 };
const INNER_WIDTH = VIEWBOX_WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = VIEWBOX_HEIGHT - MARGIN.top - MARGIN.bottom;

type ChartPoint = { x: number; y: number; value: number; month: number };

type MonthlyDeltaChartProps = {
  data: MonthlyDeltaResponse;
  livedCities?: LivedCity[];
  onReset?: () => void;
  /** Absolute URL to this kundli; when set, a QR code is shown after the cards. */
  shareUrl?: string;
};

export function MonthlyDeltaChart({
  data,
  // livedCities, // TEMP: only consumed by the disabled "Your orbit" card
  onReset,
  shareUrl,
}: MonthlyDeltaChartProps) {
  const geometry = useMemo(() => buildGeometry(data), [data]);
  const headline = buildHeadline(data);

  const cards: ReactNode[] = [];

  cards.push(
    <>
      <header className="space-y-3 text-center sm:text-left">
        <p className="text-sm text-muted-foreground">
          The sky you were born under
        </p>
        <h2 className="font-heading text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          {headline.main}
        </h2>
        <p className="mx-auto max-w-2xl text-pretty text-muted-foreground sm:mx-0 sm:text-lg">
          {headline.sub}
        </p>
      </header>

      <div className="relative mt-6">
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Monthly temperature, ${data.birthWindow.startYear}–${data.birthWindow.endYear} versus ${data.recentWindow.startYear}–${data.recentWindow.endYear}.`}
        >
          <defs>
            <linearGradient id="birthArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={COLOR_BIRTH} stopOpacity={0.35} />
              <stop offset="100%" stopColor={COLOR_BIRTH} stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="recentArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={COLOR_RECENT} stopOpacity={0.4} />
              <stop offset="100%" stopColor={COLOR_RECENT} stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="deltaBand" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={COLOR_DELTA} stopOpacity={0.55} />
              <stop offset="100%" stopColor={COLOR_DELTA} stopOpacity={0.18} />
            </linearGradient>
          </defs>

          <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
            <YAxis ticks={geometry.yTicks} />

            {geometry.birthRangeBars.map((bar) => (
              <rect
                key={`br-${bar.month}`}
                x={bar.x}
                y={bar.yTop}
                width={RANGE_BAR_WIDTH}
                height={bar.height}
                rx={2}
                fill={COLOR_BIRTH_RANGE}
                opacity={0.45}
              />
            ))}
            {geometry.recentRangeBars.map((bar) => (
              <rect
                key={`rr-${bar.month}`}
                x={bar.x}
                y={bar.yTop}
                width={RANGE_BAR_WIDTH}
                height={bar.height}
                rx={2}
                fill={COLOR_RECENT_RANGE}
                opacity={0.5}
              />
            ))}

            {geometry.deltaSegments.map((path, i) => (
              <path key={`d-${i}`} d={path} fill="url(#deltaBand)" />
            ))}

            {geometry.birthAreaSegments.map((path, i) => (
              <path key={`ba-${i}`} d={path} fill="url(#birthArea)" />
            ))}
            {geometry.recentAreaSegments.map((path, i) => (
              <path key={`ra-${i}`} d={path} fill="url(#recentArea)" />
            ))}

            {geometry.birthLineSegments.map((path, i) => (
              <path
                key={`bl-${i}`}
                d={path}
                fill="none"
                stroke={COLOR_BIRTH}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {geometry.recentLineSegments.map((path, i) => (
              <path
                key={`rl-${i}`}
                d={path}
                fill="none"
                stroke={COLOR_RECENT}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {geometry.birthPoints.map((point) => (
              <circle
                key={`bp-${point.month}`}
                cx={point.x}
                cy={point.y}
                r={3}
                fill={COLOR_BIRTH}
              />
            ))}
            {geometry.recentPoints.map((point) => (
              <circle
                key={`rp-${point.month}`}
                cx={point.x}
                cy={point.y}
                r={3.2}
                fill={COLOR_RECENT}
              />
            ))}

            <XAxis />

            {geometry.callout ? <Callout {...geometry.callout} /> : null}
          </g>
        </svg>
      </div>

      <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <LegendSwatch
            color={COLOR_BIRTH}
            label={`Then · ${data.birthWindow.startYear}–${data.birthWindow.endYear}`}
          />
          <LegendSwatch
            color={COLOR_RECENT}
            label={`Now · ${data.recentWindow.startYear}–${data.recentWindow.endYear}`}
          />
          <span className="text-xs text-muted-foreground">
            Bars = coolest–hottest month in each 5-yr window · line = average
          </span>
          <span className="text-xs uppercase tracking-wider opacity-70">
            {formatDataSource(data.source)} · {data.confidence}
          </span>
        </dl>
      </footer>
    </>,
  );

  if (data.tempTimeline) {
    cards.push(
      <LifeTempChart
        insight={data.tempTimeline}
        source={data.source}
        confidence={data.confidence}
      />,
    );
  }

  // TEMP: "Your orbit" card ("One line, every home you have known") disabled.
  // The chart is built entirely from existing data (rainRings, livedCities,
  // birthYear, hottestYears) shared with other cards, so no backend change is
  // needed to hide it — re-enable by uncommenting the import above and this block.
  // if (livedCities && livedCities.length > 0) {
  //   cards.push(
  //     <LifeOrbitChart
  //       birthYear={data.birthYear}
  //       livedCities={livedCities}
  //       rainRings={data.rainRings}
  //       latestCompleteYear={
  //         data.hottestYears?.latestCompleteYear ??
  //         data.rainRings?.latestCompleteYear ??
  //         latestCompleteYearUtc()
  //       }
  //     />,
  //   );
  // }

  if (data.rainfall) {
    cards.push(
      <MonthlyRainSection
        cityName={data.city.name}
        rainfall={data.rainfall}
        source={data.source}
        confidence={data.confidence}
      />,
    );
  }

  if (data.rainRings && data.rainRings.byCity.length > 0) {
    cards.push(
      <RainRingsChart insight={data.rainRings} source={data.source} />,
    );
  }

  if (data.hottestYears) {
    cards.push(<HottestYearsSection insight={data.hottestYears} />);
  }

  if (data.indiaEmissions) {
    cards.push(
      <EmissionsRingsChart
        birthYear={data.birthYear}
        data={data.indiaEmissions}
        parentsData={data.parentsIndiaEmissions}
        globalContext={data.globalContext}
      />,
    );
  }

  if (data.globalContext?.arcticIce) {
    cards.push(<ArcticIceSection arctic={data.globalContext.arcticIce} />);
  }

  if (data.climateMoved && data.climateMoved.migrations.length > 0) {
    cards.push(<ClimateMovedSection data={data.climateMoved} />);
  }

  cards.push(<InsightsSection data={data} />);
  cards.push(<RemediesSection data={data} />);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <ul
        className="stack-cards"
        style={{ ["--numcards" as string]: cards.length } as CSSProperties}
      >
        {cards.map((card, index) => (
          <li
            key={index}
            className="stack-card"
            style={{ ["--index" as string]: index + 1 } as CSSProperties}
          >
            <div className="stack-card__inner rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
              {card}
            </div>
          </li>
        ))}
      </ul>

      {shareUrl ? (
        <div className="flex justify-center pt-10">
          <ShareQrCode url={shareUrl} />
        </div>
      ) : null}

      {onReset ? (
        <div className="flex justify-start pt-8 pb-4">
          <Button type="button" variant="outline" size="sm" onClick={onReset}>
            Try another city
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ArcticIceSection({ arctic }: { arctic: ArcticIce }) {
  const { birthWindow, recentWindow, lostMkm2, comparison } = arctic;
  const lostText = `${lostMkm2.toFixed(2)} million km²`;
  const hasBerg = arctic.lostKm2 > 0;
  // Born before the satellite record starts: baseline is the data start (1979),
  // so phrase everything "since <year>" instead of "since you were born".
  const sinceYear = arctic.baselineIsDataStart;
  const bigStat = comparison
    ? comparison.multiple >= 1
      ? `${comparison.multiple.toFixed(comparison.multiple >= 10 ? 0 : 1)}× ${comparison.name}`
      : `${Math.round(comparison.multiple * 100)}% of ${comparison.name}`
    : `${lostMkm2.toFixed(1)}M km²`;

  return (
    <section className="space-y-6 pb-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">The melting north</p>
        <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {sinceYear
            ? `The Arctic of ${birthWindow.startYear} is gone.`
            : 'The Arctic you were born into is gone.'}
        </h2>
      </div>

      <div
        className={
          hasBerg
            ? "grid gap-6 sm:grid-cols-[220px_1fr] sm:items-center"
            : undefined
        }
      >
        {hasBerg ? (
          <div className="flex flex-col items-center gap-3">
            <ArcticIcebergChart arctic={arctic} />
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: "#dde1e5" }}
                />
                Melted since {birthWindow.startYear}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: "#89b4c6" }}
                />
                Ice today
              </span>
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-3">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Ice the size of
          </p>

          {hasBerg ? (
            <div className="space-y-1">
              <p className="font-heading text-4xl font-semibold leading-none tracking-tight sm:text-5xl">
                {bigStat}
              </p>
              <p className="text-pretty text-base text-foreground">
                {sinceYear
                  ? `gone since ${birthWindow.startYear}.`
                  : 'gone in your lifetime.'}
              </p>
            </div>
          ) : (
            <p className="text-pretty text-lg">
              Arctic summer sea ice is roughly unchanged across your lifetime —
              the steep decline came before you were born.
            </p>
          )}

          <p className="text-xs text-muted-foreground tabular-nums">
            September ice {birthWindow.extentMkm2.toFixed(2)}→
            {recentWindow.extentMkm2.toFixed(2)}M km² · a {lostText} loss ·
            NSIDC Sea Ice Index, 5-yr means
          </p>
        </div>
      </div>
    </section>
  );
}

function PeakSourceFootnote({
  blades,
}: {
  blades: NonNullable<MonthlyDeltaResponse["hottestYears"]>["blades"];
}) {
  const imdCount = blades.filter((b) => b.peakSource === "imd_station").length;
  const indiaEra5 = blades.some(
    (b) => b.isIndiaHome && b.peakSource === "era5_grid",
  );

  if (imdCount === 0 && !indiaEra5) {
    return null;
  }

  return (
    <p className="max-w-xl text-xs text-muted-foreground">
      {imdCount > 0 ? (
        <>
          Peak °C for {imdCount} {imdCount === 1 ? "year" : "years"} from
          nearest IMD station.{" "}
        </>
      ) : null}
      {indiaEra5 ? (
        <>
          Other India peaks use ERA5 grid cells (~25 km) until station history
          is loaded.{" "}
        </>
      ) : null}
      {imdCount > 0 ? (
        <a
          href="https://mausam.imd.gov.in/"
          className="underline underline-offset-2 hover:text-foreground"
          target="_blank"
          rel="noreferrer"
        >
          IMD
        </a>
      ) : null}
    </p>
  );
}

function HottestYearsSection({
  insight,
}: {
  insight: NonNullable<MonthlyDeltaResponse["hottestYears"]>;
}) {
  return (
    <section className="space-y-5 pb-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Fire sign</p>
        <p className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Fire has ruled{" "}
          <span className="text-[#d3674a]">{insight.count}</span> of your years.
        </p>
        <p className="max-w-xl text-sm text-muted-foreground">
          Top {insight.topK} at each home since {insight.recordStartYear} ·
          taller shading = hotter peak
        </p>
        <PeakSourceFootnote blades={insight.blades ?? []} />
      </div>

      {(insight.blades ?? []).length > 0 ? (
        <div className="mt-2">
          <HandFanChart
            insight={{ ...insight, blades: insight.blades ?? [] }}
          />
        </div>
      ) : null}

      {insight.byCity.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {insight.byCity.map((city) => (
            <li
              key={city.cityName}
              className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
            >
              <span className="font-medium">{city.cityName}</span>
              <span className="text-muted-foreground">
                {" "}
                — {city.hotYearsLived}/{city.yearsLived} in top {insight.topK}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {insight.years.length > 0 && !(insight.blades?.length > 0) ? (
        <p className="text-xs text-muted-foreground">
          {insight.years.length} {insight.years.length === 1 ? "year" : "years"}{" "}
          across all homes
        </p>
      ) : null}
    </section>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="block size-3 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}

function YAxis({ ticks }: { ticks: { value: number; y: number }[] }) {
  return (
    <g aria-hidden>
      {ticks.map((tick) => (
        <g key={tick.value} transform={`translate(0, ${tick.y})`}>
          <line
            x1={0}
            x2={INNER_WIDTH}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
          <text
            x={-12}
            y={4}
            textAnchor="end"
            fontSize={11}
            className="fill-muted-foreground tabular-nums"
          >
            {tick.value}°
          </text>
        </g>
      ))}
    </g>
  );
}

function XAxis() {
  return (
    <g transform={`translate(0, ${INNER_HEIGHT})`} aria-hidden>
      {MONTH_NAMES.map((label, i) => {
        const x = (i / 11) * INNER_WIDTH;
        return (
          <text
            key={label}
            x={x}
            y={24}
            textAnchor="middle"
            fontSize={9}
            className="fill-muted-foreground"
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}

interface CalloutProps {
  x: number;
  yTop: number;
  yBottom: number;
  label: string;
  sublabel: string;
  side: "left" | "right";
}

function Callout({ x, yTop, yBottom, label, sublabel, side }: CalloutProps) {
  const offset = 18;
  const textX = side === "right" ? x + offset : x - offset;
  const anchor = side === "right" ? "start" : "end";

  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={Math.max(0, yTop - 6)}
        y2={Math.min(INNER_HEIGHT, yBottom + 6)}
        stroke={COLOR_DELTA}
        strokeWidth={1.25}
        strokeDasharray="3 3"
      />
      <circle
        cx={x}
        cy={yTop}
        r={4.5}
        fill="none"
        stroke={COLOR_RECENT}
        strokeWidth={1.6}
      />
      <circle
        cx={x}
        cy={yBottom}
        r={4.5}
        fill="none"
        stroke={COLOR_BIRTH}
        strokeWidth={1.6}
      />
      <text
        x={textX}
        y={(yTop + yBottom) / 2 - 6}
        textAnchor={anchor}
        fontSize={13}
        fontWeight={600}
        className="fill-foreground"
      >
        {label}
      </text>
      <text
        x={textX}
        y={(yTop + yBottom) / 2 + 10}
        textAnchor={anchor}
        fontSize={11}
        className="fill-muted-foreground"
      >
        {sublabel}
      </text>
    </g>
  );
}

type RangeBar = { month: number; x: number; yTop: number; height: number };

interface Geometry {
  yTicks: { value: number; y: number }[];
  birthPoints: ChartPoint[];
  recentPoints: ChartPoint[];
  birthRangeBars: RangeBar[];
  recentRangeBars: RangeBar[];
  birthLineSegments: string[];
  recentLineSegments: string[];
  birthAreaSegments: string[];
  recentAreaSegments: string[];
  deltaSegments: string[];
  callout: CalloutProps | null;
}

function buildGeometry(data: MonthlyDeltaResponse): Geometry {
  const birth = data.birthWindow.monthly;
  const recent = data.recentWindow.monthly;
  const birthMin = data.birthWindow.monthlyMin ?? [];
  const birthMax = data.birthWindow.monthlyMax ?? [];
  const recentMin = data.recentWindow.monthlyMin ?? [];
  const recentMax = data.recentWindow.monthlyMax ?? [];

  const allValues = [
    ...birth,
    ...recent,
    ...birthMin,
    ...birthMax,
    ...recentMin,
    ...recentMax,
  ].filter((v): v is number => v != null);
  if (allValues.length === 0) {
    return {
      yTicks: [],
      birthPoints: [],
      recentPoints: [],
      birthRangeBars: [],
      recentRangeBars: [],
      birthLineSegments: [],
      recentLineSegments: [],
      birthAreaSegments: [],
      recentAreaSegments: [],
      deltaSegments: [],
      callout: null,
    };
  }

  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const yMin = Math.floor(dataMin - 1);
  const yMax = Math.ceil(dataMax + 1);

  const yScale = (value: number) =>
    INNER_HEIGHT - ((value - yMin) / (yMax - yMin)) * INNER_HEIGHT;
  const xScale = (monthIndex: number) => (monthIndex / 11) * INNER_WIDTH;

  const buildPoints = (monthly: (number | null)[]): ChartPoint[] => {
    const points: ChartPoint[] = [];
    for (let m = 0; m < monthly.length; m += 1) {
      const v = monthly[m];
      if (v == null) continue;
      points.push({ x: xScale(m), y: yScale(v), value: v, month: m });
    }
    return points;
  };

  const birthPoints = buildPoints(birth);
  const recentPoints = buildPoints(recent);

  const buildRangeBars = (
    mins: (number | null)[],
    maxs: (number | null)[],
    xOffset: number,
  ): RangeBar[] => {
    const bars: RangeBar[] = [];
    for (let m = 0; m < 12; m += 1) {
      const lo = mins[m];
      const hi = maxs[m];
      if (lo == null || hi == null) continue;
      const yTop = yScale(Math.max(lo, hi));
      const yBottom = yScale(Math.min(lo, hi));
      bars.push({
        month: m,
        x: xScale(m) + xOffset - RANGE_BAR_WIDTH / 2,
        yTop,
        height: Math.max(2, yBottom - yTop),
      });
    }
    return bars;
  };

  const birthRangeBars = buildRangeBars(birthMin, birthMax, -RANGE_BAR_OFFSET);
  const recentRangeBars = buildRangeBars(
    recentMin,
    recentMax,
    RANGE_BAR_OFFSET,
  );

  const buildLineSegments = (monthly: (number | null)[]): string[] => {
    const segments: string[] = [];
    let current = "";
    for (let m = 0; m < monthly.length; m += 1) {
      const v = monthly[m];
      if (v == null) {
        if (current) segments.push(current);
        current = "";
        continue;
      }
      const cmd = current ? "L" : "M";
      current += `${cmd}${xScale(m)},${yScale(v)} `;
    }
    if (current) segments.push(current);
    return segments;
  };

  const buildAreaSegments = (monthly: (number | null)[]): string[] => {
    const segments: string[] = [];
    let current: ChartPoint[] = [];
    const flush = () => {
      if (current.length < 2) {
        current = [];
        return;
      }
      const first = current[0]!;
      const last = current[current.length - 1]!;
      let d = `M${first.x},${INNER_HEIGHT} `;
      for (const p of current) {
        d += `L${p.x},${p.y} `;
      }
      d += `L${last.x},${INNER_HEIGHT} Z`;
      segments.push(d);
      current = [];
    };
    for (let m = 0; m < monthly.length; m += 1) {
      const v = monthly[m];
      if (v == null) {
        flush();
        continue;
      }
      current.push({ x: xScale(m), y: yScale(v), value: v, month: m });
    }
    flush();
    return segments;
  };

  const buildDeltaSegments = (): string[] => {
    // Polygon spanning month m → m+1 where both series have values.
    const segments: string[] = [];
    let polygon: { x: number; yRecent: number; yBirth: number }[] = [];
    const flush = () => {
      if (polygon.length < 2) {
        polygon = [];
        return;
      }
      let top = `M${polygon[0]!.x},${polygon[0]!.yRecent} `;
      for (let i = 1; i < polygon.length; i += 1) {
        top += `L${polygon[i]!.x},${polygon[i]!.yRecent} `;
      }
      for (let i = polygon.length - 1; i >= 0; i -= 1) {
        top += `L${polygon[i]!.x},${polygon[i]!.yBirth} `;
      }
      top += "Z";
      segments.push(top);
      polygon = [];
    };
    for (let m = 0; m < 12; m += 1) {
      const b = birth[m];
      const r = recent[m];
      if (b == null || r == null) {
        flush();
        continue;
      }
      polygon.push({ x: xScale(m), yRecent: yScale(r), yBirth: yScale(b) });
    }
    flush();
    return segments;
  };

  const yTicks = computeYTicks(yMin, yMax).map((value) => ({
    value,
    y: yScale(value),
  }));

  const callout: CalloutProps | null = data.largestDelta
    ? (() => {
        const m = data.largestDelta.month;
        const b = birth[m];
        const r = recent[m];
        if (b == null || r == null) return null;
        const delta = data.largestDelta.delta;
        const sign = delta >= 0 ? "+" : "";
        const direction = delta >= 0 ? "warmer" : "cooler";
        const yRecent = yScale(r);
        const yBirth = yScale(b);
        const side: "left" | "right" = m >= 8 ? "left" : "right";
        return {
          x: xScale(m),
          yTop: Math.min(yRecent, yBirth),
          yBottom: Math.max(yRecent, yBirth),
          label: `${sign}${delta.toFixed(1)}°C`,
          sublabel: `${monthName(m)} is now ${direction}`,
          side,
        };
      })()
    : null;

  return {
    yTicks,
    birthPoints,
    recentPoints,
    birthRangeBars,
    recentRangeBars,
    birthLineSegments: buildLineSegments(birth),
    recentLineSegments: buildLineSegments(recent),
    birthAreaSegments: buildAreaSegments(birth),
    recentAreaSegments: buildAreaSegments(recent),
    deltaSegments: buildDeltaSegments(),
    callout,
  };
}

function computeYTicks(yMin: number, yMax: number): number[] {
  const range = yMax - yMin;
  if (range <= 0) return [yMin];
  const step = niceStep(range / 5);
  const start = Math.ceil(yMin / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= yMax; v += step) {
    ticks.push(Math.round(v));
  }
  return ticks;
}

function niceStep(rough: number): number {
  if (rough <= 1) return 1;
  if (rough <= 2) return 2;
  if (rough <= 2.5) return 2;
  if (rough <= 5) return 5;
  return 10;
}

function buildHeadline(data: MonthlyDeltaResponse): {
  main: string;
  sub: string;
} {
  const cityName = data.city.name;
  const birthRange = `${data.birthWindow.startYear}–${data.birthWindow.endYear}`;

  if (!data.largestDelta) {
    return {
      main: `${cityName}, as it was written and as it reads now.`,
      sub: "Five-year monthly averages around your birth year compared with the last five years.",
    };
  }

  const { month, delta } = data.largestDelta;
  const monthLabel = monthName(month);
  const abs = Math.abs(delta).toFixed(1);

  if (delta >= 0.3) {
    return {
      main: `${cityName} warmed as your chart turned.`,
      sub: `An average ${monthLabel} is now ${abs}°C warmer than during ${birthRange}.`,
    };
  }

  if (delta <= -0.3) {
    return {
      main: `${cityName} defied its own omens.`,
      sub: `An average ${monthLabel} now runs ${abs}°C cooler than during ${birthRange}.`,
    };
  }

  return {
    main: `${cityName}, as it was written and as it reads now.`,
    sub: `Largest shift is in ${monthLabel} — ${abs}°C ${delta >= 0 ? "warmer" : "cooler"} than during ${birthRange}.`,
  };
}
