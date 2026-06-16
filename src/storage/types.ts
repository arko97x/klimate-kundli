import type { City, LivedCity } from "../types.js";

export interface KundliSnapshotChunk {
  index: number;
  url: string;
  width: number;
  height: number;
}

export interface KundliSnapshot {
  version: number;
  createdAt: string;
  viewportWidth: number;
  deviceScaleFactor: number;
  chunks: KundliSnapshotChunk[];
}

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
  snapshot: KundliSnapshot | null;
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
  updateSnapshot(slug: string, snapshot: KundliSnapshot): Promise<SavedKundli | null>;
}
