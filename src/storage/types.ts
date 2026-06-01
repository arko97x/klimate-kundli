import type { City, LivedCity } from "../types.js";

export interface SaveKundliInput {
  birthCity: City;
  birthYear: number;
  livedCities: LivedCity[];
  result: Record<string, unknown>;
}

export interface SavedKundli {
  slug: string;
  birthCityDisplay: string;
  birthYear: number;
  birthCity: City;
  livedCities: LivedCity[];
  result: Record<string, unknown>;
  createdAt: string;
}

export interface KundliListItem {
  slug: string;
  birthCityDisplay: string;
  birthYear: number;
  createdAt: string;
}

export interface KundliStore {
  save(input: SaveKundliInput): Promise<SavedKundli>;
  getBySlug(slug: string): Promise<SavedKundli | null>;
  list(limit: number, offset: number): Promise<KundliListItem[]>;
}
