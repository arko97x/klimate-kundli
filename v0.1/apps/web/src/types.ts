export type Cell = {
  id: number;
  label: string;
  value: string | number | null;
  detail?: string;
  data?: Record<string, unknown>;
};

export type GenerateOutput = {
  visitor: {
    birthDate: string;
    birthCity: string;
    birthPlaceResolved: string | null;
    coords: { lat: number; lon: number } | null;
  };
  cells: Cell[];
  generatedAt: string;
  elapsedMs?: number;
};

export type Stay = {
  city: string;
  country?: string;
  start: string;
  end: string;
};
