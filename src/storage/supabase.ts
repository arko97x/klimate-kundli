import { generateSlug } from "../lib/slug.js";
import type { City, LivedCity } from "../types.js";
import type { KundliListItem, KundliSnapshot, KundliStore, SaveKundliInput, SavedKundli } from "./types.js";

interface DbRow {
  slug: string;
  birth_city_display: string;
  birth_year: number;
  birth_city: City;
  lived_cities: LivedCity[];
  result: Record<string, unknown>;
  snapshot: KundliSnapshot | null;
  created_at: string;
}

export function createSupabaseKundliStore(baseUrl: string, serviceRoleKey: string): KundliStore {
  const root = baseUrl.replace(/\/$/, "");

  async function rest(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${root}/rest/v1/${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...(init?.headers ?? {}),
      },
    });
  }

  return {
    async save(input) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const slug = generateSlug();
        const row = {
          slug,
          birth_city_display: input.birthCity.displayName,
          birth_year: input.birthYear,
          birth_city: input.birthCity,
          lived_cities: input.livedCities,
          result: input.result,
        };

        const res = await rest("kundlis", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(row),
        });

        if (res.status === 409) {
          continue;
        }

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Supabase insert failed (${res.status}): ${body}`);
        }

        const rows = (await res.json()) as DbRow[];
        const saved = rows[0];
        if (!saved) {
          throw new Error("Supabase insert returned no row");
        }

        return fromDbRow(saved);
      }

      throw new Error("Could not allocate unique slug");
    },

    async getBySlug(slug) {
      const res = await rest(
        `kundlis?slug=eq.${encodeURIComponent(slug)}&select=slug,birth_city_display,birth_year,birth_city,lived_cities,result,snapshot,created_at&limit=1`,
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Supabase fetch failed (${res.status}): ${body}`);
      }

      const rows = (await res.json()) as DbRow[];
      return rows[0] ? fromDbRow(rows[0]) : null;
    },

    async list(limit, offset) {
      const res = await rest(
        `kundlis?select=slug,birth_city_display,birth_year,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`,
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Supabase list failed (${res.status}): ${body}`);
      }

      const rows = (await res.json()) as DbRow[];
      return rows.map((row) => ({
        slug: row.slug,
        birthCityDisplay: row.birth_city_display,
        birthYear: row.birth_year,
        createdAt: row.created_at,
      }));
    },

    async updateSnapshot(slug, snapshot) {
      const res = await rest(
        `kundlis?slug=eq.${encodeURIComponent(slug)}&select=slug,birth_city_display,birth_year,birth_city,lived_cities,result,snapshot,created_at`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ snapshot }),
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Supabase snapshot update failed (${res.status}): ${body}`);
      }

      const rows = (await res.json()) as DbRow[];
      return rows[0] ? fromDbRow(rows[0]) : null;
    },
  };
}

function fromDbRow(row: DbRow): SavedKundli {
  return {
    slug: row.slug,
    birthCityDisplay: row.birth_city_display,
    birthYear: row.birth_year,
    birthCity: row.birth_city,
    livedCities: row.lived_cities,
    result: row.result,
    snapshot: row.snapshot ?? null,
    createdAt: row.created_at,
  };
}
