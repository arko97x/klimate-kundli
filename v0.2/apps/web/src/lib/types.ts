// Wire types kept *manually* in sync with apps/api/src/kundli/types.ts and
// the /api/places shape. The two workspaces are not yet linked through a
// shared package, so when a field name changes on the API side, the
// mirror has to be edited here. The set is small enough that this is fine
// for v0.2; a shared `packages/types` workspace is a phase-9 chore.

export type CellStatus = "ok" | "no_data" | "pending_dataset";

export type CellKind =
  | "you"
  | "birth_year_hi"
  | "birth_year_lo"
  | "latest_birthday_hi"
  | "latest_birthday_lo"
  | "seasonal_summer"
  | "seasonal_winter"
  | "country_emissions"
  | "rain_compare"
  | "sea_level"
  | "co2_ppm"
  | "projection_2050";

export type Provenance = {
  source?: string;
  quality?: number;
  validDays?: number;
  fallback?: "monthly_normals" | null;
};

export type Cell = {
  id: number;
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

// /api/places result row.
export type PlaceHit = {
  id: number;
  slug: string;
  name: string;
  country: string;
  countryCode: string;
  admin1: string | null;
  lat: number;
  lon: number;
  population: number | null;
  tier: number;
  rank: number;
};

// Form-local stay shape (string dates, `"today"` sentinel for open end). The
// API accepts the literal `"today"` so we pass it through unchanged.
export type StayInput = {
  // a stable client-side id so React keys don't shift when a row is removed
  // from the middle of the list.
  uid: string;
  place: PlaceHit | null;
  start: string;
  end: string;
  stillHere: boolean;
};
