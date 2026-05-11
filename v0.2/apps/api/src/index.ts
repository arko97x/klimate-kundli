// Klimate Kundli v0.2 — serving API.
//
// The whole point of v0.2 is that this process never calls Open-Meteo, NASA
// POWER, or CDS at request time. Everything it serves comes from Supabase
// tables already populated by the ingest workers.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { closeDb, sql } from "./db.js";
import { env } from "./env.js";
import { placesRouter } from "./routes/places.js";
import { annualRouter } from "./routes/annual.js";
import { timeseriesRouter } from "./routes/timeseries.js";
import { kundliRouter } from "./routes/kundli.js";

const app = new Hono();

app.use(logger());
app.use("/api/*", cors({
  origin: env.WEB_ORIGIN === "*" ? "*" : [env.WEB_ORIGIN],
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));

// --- health -----------------------------------------------------------------
//
// Counts the rows that v0.2 actually serves. If any of these is 0 the
// frontend can flag the deployment as not ready (mid-rebuild, etc.).

app.get("/api/health", async (c) => {
  try {
    const rows = await sql/* sql */`
      SELECT
        (SELECT COUNT(*) FROM places)                          AS places,
        (SELECT COUNT(*) FROM daily_weather)                   AS daily_weather,
        (SELECT COUNT(*) FROM annual_extremes)                 AS annual_extremes,
        (SELECT COUNT(*) FROM annual_rain)                     AS annual_rain,
        (SELECT COUNT(*) FROM decade_rain)                     AS decade_rain,
        (SELECT COUNT(*) FROM monthly_normals)                 AS monthly_normals,
        (SELECT COUNT(*) FROM season_prefix)                   AS season_prefix,
        (SELECT COUNT(*) FROM source_provenance)               AS source_provenance,
        (SELECT MIN(date) FROM daily_weather)                  AS daily_first,
        (SELECT MAX(date) FROM daily_weather)                  AS daily_last
    `;
    const r = rows[0]!;
    return c.json({
      ok: true,
      version: "0.2.0-alpha.0",
      envFile: env.envFileUsed,
      counts: {
        places: Number(r.places),
        dailyWeather: Number(r.daily_weather),
        annualExtremes: Number(r.annual_extremes),
        annualRain: Number(r.annual_rain),
        decadeRain: Number(r.decade_rain),
        monthlyNormals: Number(r.monthly_normals),
        seasonPrefix: Number(r.season_prefix),
        sourceProvenance: Number(r.source_provenance),
      },
      coverage: {
        dailyFirst: r.daily_first,
        dailyLast: r.daily_last,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 503);
  }
});

// --- routers ---------------------------------------------------------------

app.route("/api/places", placesRouter);
app.route("/api/places", annualRouter);      // mounts /:slug/annual
app.route("/api/places", timeseriesRouter);  // mounts /:slug/{monthly,daily,decade,seasonal-range}
app.route("/api/kundli", kundliRouter);

// --- shutdown --------------------------------------------------------------

const server = serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`[api] v0.2 listening on http://localhost:${info.port}`);
  console.log(`[api] env file: ${env.envFileUsed ?? "(none found)"}`);
});

async function shutdown(signal: string) {
  console.log(`[api] received ${signal}, closing`);
  server.close();
  await closeDb();
  process.exit(0);
}
process.on("SIGINT",  () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
