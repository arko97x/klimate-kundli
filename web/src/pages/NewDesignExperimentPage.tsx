import { PrintableKundli } from "@/components/PrintableKundli";
import type { MonthlyDeltaResponse } from "@/lib/api";

// Sample data so /new previews the populated sheet (arm values).
const SAMPLE = {
  city: { displayName: "Kanpur (Cawnpore), Uttar Pradesh, India", name: "Kanpur", country: "India" },
  birthYear: 1990,
  indiaEmissions: { firstCo2Mt: 578 },
  globalContext: { seaLevelRiseMm: 21 },
  tempTimeline: {
    coolestYear: 2022,
    years: [{ year: 2022, displayName: "Bengaluru, Karnataka, India" }],
  },
  hottestYears: {
    blades: [{ year: 2010, peakTempC: 45, displayName: "Muradnagar, Uttar Pradesh, India" }],
  },
  rainRings: {
    byCity: [
      { displayName: "Kanpur (Cawnpore), Uttar Pradesh, India", years: [{ year: 2008, precipMm: 1501 }] },
    ],
  },
} as unknown as MonthlyDeltaResponse;

export function NewDesignExperimentPage() {
  return (
    <div className="h-screen w-full bg-neutral-200 flex items-center justify-center p-0 md:p-6 font-sans overflow-hidden">
      <PrintableKundli
        data={SAMPLE}
        className="h-full max-h-full max-w-full aspect-[210/297] shadow-sm"
      />
    </div>
  );
}
