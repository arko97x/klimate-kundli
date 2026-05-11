import { Flame, Snowflake, CloudRain, Waves, Wind, Sparkles, MapPin, CalendarClock } from "lucide-react";

import { ProvenancePill } from "@/components/ProvenancePill";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Cell as CellT, CellKind } from "@/lib/types";

const ROMAN = [
  "I", "II", "III", "IV", "V", "VI",
  "VII", "VIII", "IX", "X", "XI", "XII",
];

// Each cell kind maps to: an icon, a tint colour (one of the four domain
// hues from styles.css), and an emphasis weight for the primary value.
// The kind also decides the visual hierarchy — "you" is centered and
// nameplate-styled; everything else is a stat card.
const KIND_META: Record<CellKind, { icon: typeof Flame; tint: string }> = {
  you:                  { icon: Sparkles,      tint: "text-foreground" },
  birth_year_hi:        { icon: Flame,         tint: "text-ember" },
  birth_year_lo:        { icon: Snowflake,     tint: "text-frost" },
  latest_birthday_hi:   { icon: Flame,         tint: "text-ember" },
  latest_birthday_lo:   { icon: Snowflake,     tint: "text-frost" },
  seasonal_summer:      { icon: Flame,         tint: "text-ember" },
  seasonal_winter:      { icon: Snowflake,     tint: "text-frost" },
  country_emissions:    { icon: Wind,          tint: "text-ochre" },
  rain_compare:         { icon: CloudRain,     tint: "text-monsoon" },
  sea_level:            { icon: Waves,         tint: "text-monsoon" },
  co2_ppm:              { icon: Wind,          tint: "text-ochre" },
  projection_2050:      { icon: CalendarClock, tint: "text-ochre" },
};

type Props = {
  cell: CellT;
  // Stagger the entrance animation across the grid — same cubic-bezier on
  // every cell with an incrementing delay reads as one coordinated reveal.
  animIndex?: number;
};

export function Cell({ cell, animIndex = 0 }: Props) {
  const meta = KIND_META[cell.kind];
  const Icon = meta.icon;

  // The "you" cell is special: nameplate-style, centered, no big number.
  if (cell.kind === "you") {
    return (
      <CellShell cell={cell} animIndex={animIndex} className="md:row-span-1">
        <div className="flex h-full flex-col items-center justify-center text-center">
          <MapPin className="mb-3 h-5 w-5 text-primary" />
          <p className="eyebrow mb-3">The native</p>
          <p className="font-display text-3xl font-medium leading-none tracking-tight text-foreground md:text-4xl">
            {typeof cell.primary === "string" ? cell.primary : "—"}
          </p>
          {cell.detail && (
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              {cell.detail}
            </p>
          )}
        </div>
      </CellShell>
    );
  }

  if (cell.status === "pending_dataset") {
    return (
      <CellShell cell={cell} animIndex={animIndex}>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow leading-snug max-w-[14ch]">{cell.label}</p>
            <Icon className={cn("h-4 w-4 opacity-50", meta.tint)} />
          </div>
          <div className="flex flex-1 items-center">
            <div className="w-full space-y-2">
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">
            arriving · phase 4.5
          </p>
        </div>
      </CellShell>
    );
  }

  if (cell.status === "no_data") {
    return (
      <CellShell cell={cell} animIndex={animIndex}>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow leading-snug max-w-[14ch]">{cell.label}</p>
            <Icon className={cn("h-4 w-4 opacity-50", meta.tint)} />
          </div>
          <div className="flex flex-1 items-center">
            <p className="font-display text-3xl font-medium leading-none text-muted-foreground/60">
              —
            </p>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {cell.detail ?? "no data in archive"}
          </p>
        </div>
      </CellShell>
    );
  }

  return (
    <CellShell cell={cell} animIndex={animIndex}>
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow leading-snug max-w-[16ch]">{cell.label}</p>
          <Icon className={cn("h-4 w-4", meta.tint)} />
        </div>
        <div className="flex flex-1 items-center">
          <p
            className={cn(
              "font-display font-medium leading-none tracking-tight",
              "text-[2.25rem] md:text-[2.75rem]",
              meta.tint,
            )}
          >
            {cell.primary ?? "—"}
          </p>
        </div>
        {cell.detail && (
          <p className="font-mono text-[0.7rem] leading-snug text-muted-foreground">
            {cell.detail}
          </p>
        )}
        {cell.provenance && (
          <ProvenancePill provenance={cell.provenance} className="mt-3 self-start" />
        )}
      </div>
    </CellShell>
  );
}

// ---------------------------------------------------------------------------
// shell — common chrome + Roman numeral + stagger
// ---------------------------------------------------------------------------

function CellShell({
  cell,
  animIndex,
  className,
  children,
}: {
  cell: CellT;
  animIndex: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        // Each cell is its own panel of parchment with a hairline rule. Slight
        // tonal step from the page so the grid reads as a diagram, not a
        // single flat block. Hover: a feather-light lift.
        "group relative isolate flex min-h-[180px] flex-col overflow-hidden rounded-sm border border-foreground/15 bg-card/70 p-5 pt-7",
        "shadow-[0_1px_0_hsl(var(--background)),inset_0_0_0_1px_hsl(var(--foreground)/0.025)]",
        "transition-[transform,box-shadow] duration-300 hover:-translate-y-[1px] hover:shadow-[0_8px_24px_-18px_hsl(24_18%_14%_/_0.4)]",
        "animate-fade-up",
        className,
      )}
      style={{ animationDelay: `${animIndex * 50}ms` }}
      aria-label={`House ${cell.id}: ${cell.label}`}
    >
      {/* Roman numeral, faint, top-left. Acts as the kundli "house" number. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1.5 select-none font-display text-[0.7rem] font-medium uppercase tracking-[0.2em] text-foreground/45"
      >
        {ROMAN[cell.id - 1] ?? cell.id}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1.5 select-none font-mono text-[0.6rem] text-foreground/30"
      >
        {String(cell.id).padStart(2, "0")}/12
      </span>
      {children}
    </article>
  );
}
