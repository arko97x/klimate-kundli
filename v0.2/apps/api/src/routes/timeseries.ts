// Per-place lookups against daily_weather + the aggregate tables.
//
// Four sibling endpoints, all rooted at /api/places/:slug:
//
//   GET /:slug/monthly?baseline_start=&baseline_end=&source=
//   GET /:slug/daily?date=YYYY-MM-DD&source=
//   GET /:slug/decade?start=YYYY&source=
//   GET /:slug/seasonal-range?season=summer|winter&start=&end=&source=
//
// All return 404 if the slug doesn't resolve. They return 200 with a typed
// `null` block when the place exists but the requested slice has no data
// — the kundli builder treats that as "fallback or pending" instead of an
// error.

import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db.js";

export const timeseriesRouter = new Hono();

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const YearStr = z.coerce.number().int().min(1900).max(2100);
const SourceStr = z.string().trim().min(1).max(32).default("era5");

// --- shared place lookup ---------------------------------------------------

async function resolvePlaceId(slug: string): Promise<number | null> {
  const rows = await sql/* sql */`SELECT id FROM places WHERE slug = ${slug} LIMIT 1`;
  return rows[0] ? Number(rows[0].id) : null;
}

// --- monthly_normals -------------------------------------------------------

const MonthlyQuery = z.object({
  baseline_start: z.coerce.number().int().min(1900).max(2100).optional(),
  baseline_end: z.coerce.number().int().min(1900).max(2100).optional(),
  source: SourceStr,
});

timeseriesRouter.get("/:slug/monthly", async (c) => {
  const slug = c.req.param("slug").trim().toLowerCase();
  const parsed = MonthlyQuery.safeParse({
    baseline_start: c.req.query("baseline_start"),
    baseline_end: c.req.query("baseline_end"),
    source: c.req.query("source"),
  });
  if (!parsed.success) {
    return c.json({ error: "invalid query", issues: parsed.error.issues }, 400);
  }
  const placeId = await resolvePlaceId(slug);
  if (placeId === null) return c.json({ error: "place not found", slug }, 404);

  const { source } = parsed.data;
  let { baseline_start, baseline_end } = parsed.data;

  // Without an explicit window, pick whichever window has rows. Prefer the
  // WMO 1991–2020 baseline if present.
  if (baseline_start === undefined || baseline_end === undefined) {
    const rows = await sql/* sql */`
      SELECT baseline_start, baseline_end, COUNT(*) AS n
        FROM monthly_normals
       WHERE place_id = ${placeId} AND source = ${source}
       GROUP BY baseline_start, baseline_end
       ORDER BY
         CASE WHEN baseline_start = 1991 AND baseline_end = 2020 THEN 0 ELSE 1 END,
         (baseline_end - baseline_start) DESC
       LIMIT 1
    `;
    if (!rows[0]) {
      return c.json({ place: { id: placeId, slug }, source, baseline: null, months: [] });
    }
    baseline_start = Number(rows[0].baseline_start);
    baseline_end = Number(rows[0].baseline_end);
  }

  const months = await sql/* sql */`
    SELECT month, tmax_avg_c, tmin_avg_c, rain_avg_mm, quality
      FROM monthly_normals
     WHERE place_id = ${placeId}
       AND source = ${source}
       AND baseline_start = ${baseline_start}
       AND baseline_end   = ${baseline_end}
     ORDER BY month
  `;

  return c.json({
    place: { id: placeId, slug },
    source,
    baseline: { start: baseline_start, end: baseline_end },
    months: months.map((m) => ({
      month: Number(m.month),
      tmaxAvgC: m.tmax_avg_c === null ? null : Number(m.tmax_avg_c),
      tminAvgC: m.tmin_avg_c === null ? null : Number(m.tmin_avg_c),
      rainAvgMm: m.rain_avg_mm === null ? null : Number(m.rain_avg_mm),
      quality: Number(m.quality),
    })),
  });
});

// --- daily_weather (single day) -------------------------------------------

const DailyQuery = z.object({ date: DateStr, source: SourceStr });

timeseriesRouter.get("/:slug/daily", async (c) => {
  const slug = c.req.param("slug").trim().toLowerCase();
  const parsed = DailyQuery.safeParse({ date: c.req.query("date"), source: c.req.query("source") });
  if (!parsed.success) {
    return c.json({ error: "invalid query", issues: parsed.error.issues }, 400);
  }
  const placeId = await resolvePlaceId(slug);
  if (placeId === null) return c.json({ error: "place not found", slug }, 404);

  const { date, source } = parsed.data;
  const rows = await sql/* sql */`
    SELECT date, tmax_c, tmin_c, precip_mm, quality
      FROM daily_weather
     WHERE place_id = ${placeId}
       AND source   = ${source}
       AND date     = ${date}
     LIMIT 1
  `;

  return c.json({
    place: { id: placeId, slug },
    source,
    date,
    row: rows[0]
      ? {
          tmaxC: rows[0].tmax_c === null ? null : Number(rows[0].tmax_c),
          tminC: rows[0].tmin_c === null ? null : Number(rows[0].tmin_c),
          precipMm: rows[0].precip_mm === null ? null : Number(rows[0].precip_mm),
          quality: Number(rows[0].quality),
        }
      : null,
  });
});

// --- decade_rain -----------------------------------------------------------

const DecadeQuery = z.object({ start: YearStr, source: SourceStr });

timeseriesRouter.get("/:slug/decade", async (c) => {
  const slug = c.req.param("slug").trim().toLowerCase();
  const parsed = DecadeQuery.safeParse({ start: c.req.query("start"), source: c.req.query("source") });
  if (!parsed.success) {
    return c.json({ error: "invalid query", issues: parsed.error.issues }, 400);
  }
  const placeId = await resolvePlaceId(slug);
  if (placeId === null) return c.json({ error: "place not found", slug }, 404);

  const { start, source } = parsed.data;
  // Force decade alignment server-side so callers can pass 1992 and still
  // get the 1990s row.
  const decadeStart = Math.floor(start / 10) * 10;

  const rows = await sql/* sql */`
    SELECT decade_start, avg_annual_rain_mm, years_used, quality
      FROM decade_rain
     WHERE place_id     = ${placeId}
       AND source       = ${source}
       AND decade_start = ${decadeStart}
     LIMIT 1
  `;

  return c.json({
    place: { id: placeId, slug },
    source,
    decadeStart,
    row: rows[0]
      ? {
          avgAnnualRainMm: rows[0].avg_annual_rain_mm === null ? null : Number(rows[0].avg_annual_rain_mm),
          yearsUsed: Number(rows[0].years_used),
          quality: Number(rows[0].quality),
        }
      : null,
  });
});

// --- season_prefix range average ------------------------------------------
//
// Two point lookups in season_prefix give us the cumulative sums at
// (start - 1 day) and end; subtract for tmax/tmin sums and count, divide
// for the season average over the visitor's stay window.

const SeasonalQuery = z.object({
  season: z.enum(["summer", "winter"]),
  start: DateStr,
  end: DateStr,
  source: SourceStr,
});

timeseriesRouter.get("/:slug/seasonal-range", async (c) => {
  const slug = c.req.param("slug").trim().toLowerCase();
  const parsed = SeasonalQuery.safeParse({
    season: c.req.query("season"),
    start: c.req.query("start"),
    end: c.req.query("end"),
    source: c.req.query("source"),
  });
  if (!parsed.success) {
    return c.json({ error: "invalid query", issues: parsed.error.issues }, 400);
  }
  const placeId = await resolvePlaceId(slug);
  if (placeId === null) return c.json({ error: "place not found", slug }, 404);

  const { season, start, end, source } = parsed.data;
  if (start > end) return c.json({ error: "start must be <= end" }, 400);

  const rows = await sql/* sql */`
    WITH endpoints AS (
      SELECT
        (SELECT row_to_json(t) FROM (
          SELECT tmax_cum, tmin_cum, count_cum
            FROM season_prefix
           WHERE place_id = ${placeId} AND source = ${source}
             AND season = ${season} AND date <= ${end}
           ORDER BY date DESC LIMIT 1
        ) t) AS end_row,
        (SELECT row_to_json(t) FROM (
          SELECT tmax_cum, tmin_cum, count_cum
            FROM season_prefix
           WHERE place_id = ${placeId} AND source = ${source}
             AND season = ${season} AND date < ${start}
           ORDER BY date DESC LIMIT 1
        ) t) AS start_row
    )
    SELECT * FROM endpoints
  `;
  const r = rows[0];
  const endRow = (r?.end_row ?? null) as { tmax_cum: number; tmin_cum: number; count_cum: number } | null;
  if (!endRow) {
    return c.json({
      place: { id: placeId, slug }, source, season, start, end,
      result: null,
    });
  }
  const startRow = (r?.start_row ?? null) as { tmax_cum: number; tmin_cum: number; count_cum: number } | null;
  const tmaxSum = Number(endRow.tmax_cum) - Number(startRow?.tmax_cum ?? 0);
  const tminSum = Number(endRow.tmin_cum) - Number(startRow?.tmin_cum ?? 0);
  const count = Number(endRow.count_cum) - Number(startRow?.count_cum ?? 0);
  return c.json({
    place: { id: placeId, slug }, source, season, start, end,
    result: count > 0
      ? {
          tmaxAvgC: tmaxSum / count,
          tminAvgC: tminSum / count,
          days: count,
        }
      : null,
  });
});
