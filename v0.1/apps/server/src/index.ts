import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { SERVER_PORT, WEB_ORIGIN } from "./config.js";
import { generateKundli } from "./compute.js";
import { db, dbPath } from "./db.js";

const app = new Hono();

app.use("/*", cors({ origin: WEB_ORIGIN, allowMethods: ["GET", "POST", "OPTIONS"] }));

app.get("/api/health", (c) => {
  const counts = {
    geocode: (db.prepare(`SELECT COUNT(*) AS n FROM geocode`).get() as { n: number }).n,
    weather_daily: (db.prepare(`SELECT COUNT(*) AS n FROM weather_daily`).get() as { n: number }).n,
    climate_proj_daily: (db.prepare(`SELECT COUNT(*) AS n FROM climate_proj_daily`).get() as { n: number }).n,
    co2_annual: (db.prepare(`SELECT COUNT(*) AS n FROM co2_annual`).get() as { n: number }).n,
    emissions_annual: (db.prepare(`SELECT COUNT(*) AS n FROM emissions_annual`).get() as { n: number }).n,
    sea_level_monthly: (db.prepare(`SELECT COUNT(*) AS n FROM sea_level_monthly`).get() as { n: number }).n,
  };
  return c.json({ ok: true, dbPath: dbPath(), counts });
});

const StaySchema = z.object({
  city: z.string().min(1),
  country: z.string().optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const GenerateSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthCity: z.string().min(1),
  birthCountry: z.string().optional(),
  citiesLivedIn: z.array(StaySchema).default([]),
});

app.post("/api/generate", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid input", issues: parsed.error.issues }, 400);
  }
  const t0 = Date.now();
  try {
    const result = await generateKundli(parsed.data);
    return c.json({ ...result, elapsedMs: Date.now() - t0 });
  } catch (err) {
    console.error("generate failed:", err);
    return c.json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});

app.get("/api/geocode", async (c) => {
  const city = c.req.query("city");
  const country = c.req.query("country");
  if (!city) return c.json({ error: "city required" }, 400);
  const { getGeocode } = await import("./cache.js");
  const r = await getGeocode(city, country);
  if (!r) return c.json({ error: "not found" }, 404);
  return c.json(r);
});

app.get("/api/geocode/search", async (c) => {
  const q = c.req.query("q");
  const limit = Math.min(15, Math.max(1, Number(c.req.query("limit") ?? 8)));
  if (!q || q.trim().length < 2) return c.json({ results: [] });
  const { geocodeSearch } = await import("./sources/openMeteo.js");
  const { lookupAlias, lookupCanonicalForQuery, relatedQueriesFor } = await import("./cityAliases.js");
  try {
    // Query expansion has two flavours:
    //   1. Alias canonical: "bombay" → also search "Mumbai" (same place,
    //      different name; Open-Meteo only indexes under the canonical).
    //   2. Related queries: "amravati" → also search "amaravati" (different
    //      places with confusable spellings; prefix match won't bridge them).
    const aliasOf = lookupCanonicalForQuery(q.trim());
    const related = relatedQueriesFor(q.trim());
    const extras = [aliasOf, ...related].filter((s): s is string => !!s);
    const results = await geocodeSearch(q.trim(), limit, extras);
    // Annotate each result with its also-known-as set (Calcutta ⇄ Kolkata,
    // Bombay ⇄ Mumbai, etc.). The UI shows these inline so users don't have
    // to know the canonical spelling.
    const enriched = results.map((r) => {
      const head = r.displayName.split(",")[0]?.trim() ?? "";
      // Country-scoped: "Calcutta, Ohio, US" stays as "Calcutta", only the
      // Indian Calcutta gets re-labelled to "Kolkata".
      const alias = lookupAlias(head, r.countryCode);
      return {
        ...r,
        canonical: alias?.canonical ?? head,
        alsoKnownAs: alias?.alsoKnownAs ?? [],
      };
    });
    return c.json({ results: enriched });
  } catch (err) {
    return c.json({ error: String(err instanceof Error ? err.message : err) }, 502);
  }
});

serve({ fetch: app.fetch, port: SERVER_PORT }, (info) => {
  console.log(`klimate-kundli server on http://localhost:${info.port}`);
  console.log(`db: ${dbPath()}`);
});
