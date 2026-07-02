import { PrintableKundli } from "@/components/PrintableKundli";
import type { MonthlyDeltaResponse } from "@/lib/api";

// Sample data so /new previews the populated sheet (arm values).
const SAMPLE = {
  city: { displayName: "Kanpur (Cawnpore), Uttar Pradesh, India", name: "Kanpur", country: "India" },
  birthYear: 1990,
  indiaEmissions: {
    firstCo2Mt: 578,
    years: Array.from({ length: 34 }, (_, i) => {
      const total = 578 + ((2955 - 578) * i) / 33;
      return {
        year: 1990 + i,
        co2Mt: Math.round(total),
        coalMt: total * 0.7,
        oilMt: total * 0.15,
        cementMt: total * 0.07,
        gasMt: total * 0.05,
        flaringMt: total * 0.03,
      };
    }),
  },
  globalContext: {
    seaLevelRiseMm: 21,
    arcticIce: {
      birthWindow: { startYear: 1990, endYear: 1995, extentMkm2: 6.5 },
      recentWindow: { startYear: 2019, endYear: 2024, extentMkm2: 4.2 },
      lostKm2: 2_300_000,
      lostMkm2: 2.3,
      comparison: { unit: "country", name: "India", code: "IN", areaKm2: 3_287_000, multiple: 0.7 },
    },
  },
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
