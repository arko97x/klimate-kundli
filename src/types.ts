export type Confidence = "exact" | "high" | "medium" | "low" | "unavailable";

export type Source =
  | "era5"
  | "nasa_power"
  | "imd"
  | "nearest_city"
  | "cmip6"
  | "extrapolated"
  | "input"
  | "static_csv";

export interface City {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  country: string;
  admin1?: string;
  alternateNames?: string[];
}

export interface LivedCity extends City {
  start: string;
  end: string | null;
}

export interface KundliCard<TData = Record<string, unknown>> {
  id: number;
  type: string;
  data: TData;
  source: Source;
  confidence: Confidence;
  reason?: string;
}

export interface TelemetrySummary {
  totalMs: number;
  fallbacksFired: string[];
  cacheHits: number;
  cacheMisses: number;
  partial: boolean;
}
