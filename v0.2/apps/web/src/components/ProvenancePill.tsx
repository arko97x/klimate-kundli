import { Database } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Provenance } from "@/lib/types";

// A small caption strip at the bottom of a cell that names the data source
// and any caveats. Designed to be readable from across an exhibition room
// without dominating the cell's primary value.
//
// Conventions:
//   - source : ERA5 / IMD / GHCN / Mauna Loa / NSIDC, etc.
//   - quality: 0..1 from the aggregate builder; we surface it as a percent.
//   - validDays: only shown when we know the cell *should* have ~365 days
//     and got fewer (i.e. partial-year coverage in the archive).
//   - fallback="monthly_normals": rendered as the word "normal" because the
//     cell value is the long-run monthly normal, not the actual day.
export function ProvenancePill({
  provenance,
  className,
}: {
  provenance?: Provenance;
  className?: string;
}) {
  if (!provenance) return null;
  const bits: string[] = [];
  if (provenance.source) bits.push(provenance.source.toUpperCase());
  if (provenance.fallback === "monthly_normals") bits.push("normal");
  if (typeof provenance.quality === "number" && Number.isFinite(provenance.quality)) {
    bits.push(`${Math.round(provenance.quality * 100)}%`);
  }
  if (typeof provenance.validDays === "number" && provenance.validDays > 0 && provenance.validDays < 360) {
    bits.push(`${provenance.validDays}d`);
  }
  if (bits.length === 0) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-background/70 px-2 py-[3px]",
        "font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground",
        className,
      )}
    >
      <Database className="h-2.5 w-2.5" strokeWidth={2.2} />
      <span>{bits.join(" · ")}</span>
    </div>
  );
}
