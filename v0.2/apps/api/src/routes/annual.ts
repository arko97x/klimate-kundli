// /api/places/:slug/annual?year=YYYY[&source=era5]
//
// Returns the annual_extremes + annual_rain rows for one place. Designed to
// be the data source for kundli cells 2 (birth-year hot day) and 3 (birth-
// year cold day) plus the lifetime-rainfall cell.
//
// If neither table has a row for that (place, year) the response is `null`
// for the missing block rather than 404 — the UI will degrade gracefully
// (e.g. fall back to monthly_normals).

import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db.js";

export const annualRouter = new Hono();

const AnnualQuery = z.object({
  year: z.coerce.number().int().min(1900).max(2100),
  source: z.string().trim().min(1).max(32).default("era5"),
});

annualRouter.get("/:slug/annual", async (c) => {
  const slug = c.req.param("slug").trim().toLowerCase();
  const parsed = AnnualQuery.safeParse({
    year: c.req.query("year"),
    source: c.req.query("source"),
  });
  if (!parsed.success) {
    return c.json({ error: "invalid query", issues: parsed.error.issues }, 400);
  }
  const { year, source } = parsed.data;

  // One round-trip with two LEFT JOINs anchored on the place row. Anchoring
  // on `places` instead of on the aggregate tables lets us tell "place not
  // found" apart from "place found but no data for that year".
  const rows = await sql/* sql */`
    SELECT
      p.id, p.slug, p.name, p.country, p.country_code,
      ae.max_temp_c, ae.max_temp_date, ae.min_temp_c, ae.min_temp_date,
      ae.valid_days AS extremes_valid_days,
      ae.quality    AS extremes_quality,
      ar.rain_mm,
      ar.valid_days AS rain_valid_days,
      ar.quality    AS rain_quality
    FROM places p
    LEFT JOIN annual_extremes ae
      ON ae.place_id = p.id AND ae.year = ${year} AND ae.source = ${source}
    LEFT JOIN annual_rain     ar
      ON ar.place_id = p.id AND ar.year = ${year} AND ar.source = ${source}
    WHERE p.slug = ${slug}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return c.json({ error: "place not found", slug }, 404);

  const haveExtremes =
    row.max_temp_c !== null || row.min_temp_c !== null;
  const haveRain = row.rain_mm !== null;

  return c.json({
    place: {
      id: Number(row.id),
      slug: row.slug as string,
      name: row.name as string,
      country: row.country as string,
      countryCode: row.country_code as string,
    },
    year,
    source,
    extremes: haveExtremes
      ? {
          maxTempC: row.max_temp_c === null ? null : Number(row.max_temp_c),
          maxTempDate: row.max_temp_date,
          minTempC: row.min_temp_c === null ? null : Number(row.min_temp_c),
          minTempDate: row.min_temp_date,
          validDays: Number(row.extremes_valid_days),
          quality: Number(row.extremes_quality),
        }
      : null,
    rain: haveRain
      ? {
          rainMm: row.rain_mm === null ? null : Number(row.rain_mm),
          validDays: Number(row.rain_valid_days),
          quality: Number(row.rain_quality),
        }
      : null,
  });
});
