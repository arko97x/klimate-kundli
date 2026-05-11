// Wire types for /api/kundli.
//
// The cell list is a *fixed-shape array* of 12 entries — the UI lays them out
// in a 3×4 grid and the visual order matters. Cells we can't answer yet
// (no data ingested for that source/range) come back with status "pending"
// so the UI can render a skeleton without a separate code path.

export type CellStatus = "ok" | "no_data" | "pending_dataset";

export type CellKind =
  | "you"                    //  1: nameplate
  | "birth_year_hi"          //  2: hottest day of the year you were born
  | "birth_year_lo"          //  3: coldest day of the year you were born
  | "latest_birthday_hi"     //  4: hottest most-recent birthday
  | "latest_birthday_lo"     //  5: coldest most-recent birthday
  | "seasonal_summer"        //  6: summer-avg across your lived cities
  | "seasonal_winter"        //  7: winter-avg across your lived cities
  | "country_emissions"      //  8: lifetime cumulative emissions (pending)
  | "rain_compare"           //  9: birth-decade vs latest-decade rainfall
  | "sea_level"              // 10: global sea-level rise during your life (pending)
  | "co2_ppm"                // 11: CO2 ppm at birth vs today (pending)
  | "projection_2050"        // 12: projected 2050 weather at birthplace (pending)
  ;

export type Provenance = {
  source?: string;
  quality?: number;
  validDays?: number;
  fallback?: "monthly_normals" | null;
};

export type Cell = {
  id: number;            // 1..12, stable order
  kind: CellKind;
  status: CellStatus;
  label: string;
  primary: string | number | null;
  detail?: string;
  data?: Record<string, unknown>;
  provenance?: Provenance;
};

export type KundliStay = {
  slug: string;
  name: string;
  country: string;
  start: string;
  end: string;
};

export type KundliResponse = {
  visitor: {
    birthSlug: string;
    birthName: string;
    birthCountry: string;
    birthDate: string;
    birthYear: number;
    coords: { lat: number; lon: number };
  };
  stays: KundliStay[];
  cells: Cell[];
  generatedAt: string;
  elapsedMs: number;
};
