// /api/places — search + resolve.
//
// Search: `GET /api/places?q=mum` returns ranked matches across `places.name`,
// `places.slug`, and `place_aliases.alias` (citext, so case-insensitive).
// Prefix matches outrank substring matches, and exact slug matches always
// win.
//
// Resolve: `GET /api/places/:slug` returns the full row for one place plus
// its aliases.

import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db.js";

export const placesRouter = new Hono();

const SearchQuery = z.object({
  q: z.string().trim().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

placesRouter.get("/", async (c) => {
  const parsed = SearchQuery.safeParse({
    q: c.req.query("q"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) {
    return c.json({ error: "invalid query", issues: parsed.error.issues }, 400);
  }
  const { q, limit } = parsed.data;

  // The rank CTE folds three signals into one ordering:
  //   - exact slug or name match              → rank 0
  //   - prefix match on name/alias            → rank 1
  //   - substring match anywhere              → rank 2
  // Tie-break by population so well-known cities surface first.
  const rows = await sql/* sql */`
    WITH candidates AS (
      SELECT p.id, p.slug, p.name, p.country_code, p.country, p.admin1,
             p.lat, p.lon, p.population, p.tier,
             CASE
               WHEN p.slug = ${q.toLowerCase()} THEN 0
               WHEN p.name ILIKE ${q} THEN 0
               WHEN p.name ILIKE ${q + "%"} THEN 1
               WHEN p.name ILIKE ${"%" + q + "%"} THEN 2
               ELSE 3
             END AS name_rank
        FROM places p
       WHERE p.slug = ${q.toLowerCase()}
          OR p.name ILIKE ${"%" + q + "%"}
      UNION
      SELECT p.id, p.slug, p.name, p.country_code, p.country, p.admin1,
             p.lat, p.lon, p.population, p.tier,
             CASE
               WHEN a.alias = ${q} THEN 0
               WHEN a.alias ILIKE ${q + "%"} THEN 1
               ELSE 2
             END AS name_rank
        FROM place_aliases a
        JOIN places p ON p.id = a.place_id
       WHERE a.alias ILIKE ${"%" + q + "%"}
    )
    SELECT id, slug, name, country_code, country, admin1, lat, lon, population, tier,
           MIN(name_rank) AS rank
      FROM candidates
     GROUP BY id, slug, name, country_code, country, admin1, lat, lon, population, tier
     ORDER BY MIN(name_rank), COALESCE(population, 0) DESC, name
     LIMIT ${limit}
  `;

  return c.json({
    query: q,
    count: rows.length,
    results: rows.map((r) => ({
      id: Number(r.id),
      slug: r.slug as string,
      name: r.name as string,
      countryCode: r.country_code as string,
      country: r.country as string,
      admin1: (r.admin1 as string | null) ?? null,
      lat: Number(r.lat),
      lon: Number(r.lon),
      population: r.population === null ? null : Number(r.population),
      tier: Number(r.tier),
      rank: Number(r.rank),
    })),
  });
});

placesRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug").trim().toLowerCase();
  const rows = await sql/* sql */`
    SELECT p.id, p.slug, p.name, p.country_code, p.country, p.admin1,
           p.lat, p.lon, p.population, p.tier,
           COALESCE(
             (SELECT json_agg(a.alias::text ORDER BY a.alias)
                FROM place_aliases a WHERE a.place_id = p.id),
             '[]'::json
           ) AS aliases
      FROM places p
     WHERE p.slug = ${slug}
     LIMIT 1
  `;
  const row = rows[0];
  if (!row) return c.json({ error: "not found", slug }, 404);

  return c.json({
    id: Number(row.id),
    slug: row.slug as string,
    name: row.name as string,
    countryCode: row.country_code as string,
    country: row.country as string,
    admin1: (row.admin1 as string | null) ?? null,
    lat: Number(row.lat),
    lon: Number(row.lon),
    population: row.population === null ? null : Number(row.population),
    tier: Number(row.tier),
    aliases: (row.aliases as string[]) ?? [],
  });
});
