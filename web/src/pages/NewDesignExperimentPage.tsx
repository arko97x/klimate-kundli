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
    blades: [
      { year: 2004, peakTempC: 41.2, cityName: "Kanpur", displayName: "Kanpur, Uttar Pradesh, India" },
      { year: 2007, peakTempC: 43.5, cityName: "Kanpur", displayName: "Kanpur, Uttar Pradesh, India" },
      { year: 2008, peakTempC: 39.8, cityName: "Kanpur", displayName: "Kanpur, Uttar Pradesh, India" },
      { year: 2010, peakTempC: 45.0, cityName: "Muradnagar", displayName: "Muradnagar, Uttar Pradesh, India" },
      { year: 2021, peakTempC: 38.2, cityName: "Bengaluru", displayName: "Bengaluru, Karnataka, India" },
      { year: 2022, peakTempC: 39.0, cityName: "Bengaluru", displayName: "Bengaluru, Karnataka, India" },
      { year: 2023, peakTempC: 40.1, cityName: "Bengaluru", displayName: "Bengaluru, Karnataka, India" },
      { year: 2024, peakTempC: 41.5, cityName: "Bengaluru", displayName: "Bengaluru, Karnataka, India" },
    ],
  },
  rainRings: {
    byCity: [
      {
        displayName: "Kanpur (Cawnpore), Uttar Pradesh, India",
        startYear: 1990,
        endYear: 2009,
        years: Array.from({ length: 20 }, (_, i) => ({
          year: 1990 + i,
          precipMm: Math.round(600 + Math.sin(i) * 200 + (i % 3 === 0 ? 300 : 0)),
        })),
      },
      {
        displayName: "Bengaluru, Karnataka, India",
        startYear: 2010,
        endYear: 2024,
        years: Array.from({ length: 15 }, (_, i) => ({
          year: 2010 + i,
          precipMm: Math.round(800 + Math.cos(i) * 150 + (i % 2 === 0 ? 100 : 0)),
        })),
      },
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
