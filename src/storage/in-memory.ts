import { generateSlug } from "../lib/slug.js";
import type { KundliListItem, KundliStore, SaveKundliInput, SavedKundli } from "./types.js";

export class InMemoryKundliStore implements KundliStore {
  private readonly bySlug = new Map<string, SavedKundli>();
  private readonly ordered: SavedKundli[] = [];

  async save(input: SaveKundliInput): Promise<SavedKundli> {
    let slug = generateSlug();

    while (this.bySlug.has(slug)) {
      slug = generateSlug();
    }

    const saved: SavedKundli = {
      slug,
      birthCityDisplay: input.birthCity.displayName,
      birthYear: input.birthYear,
      birthCity: input.birthCity,
      livedCities: input.livedCities,
      result: input.result,
      snapshot: null,
      createdAt: new Date().toISOString(),
    };

    this.bySlug.set(slug, saved);
    this.ordered.unshift(saved);
    return saved;
  }

  async getBySlug(slug: string): Promise<SavedKundli | null> {
    return this.bySlug.get(slug) ?? null;
  }

  async list(limit: number, offset: number): Promise<KundliListItem[]> {
    return this.ordered.slice(offset, offset + limit).map(toListItem);
  }

  async updateSnapshot(slug: string, snapshot: NonNullable<SavedKundli["snapshot"]>): Promise<SavedKundli | null> {
    const saved = this.bySlug.get(slug);
    if (!saved || !snapshot) {
      return null;
    }

    saved.snapshot = snapshot;
    return saved;
  }
}

function toListItem(saved: SavedKundli): KundliListItem {
  return {
    slug: saved.slug,
    birthCityDisplay: saved.birthCityDisplay,
    birthYear: saved.birthYear,
    createdAt: saved.createdAt,
  };
}
