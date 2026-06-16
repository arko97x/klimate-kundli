import { Hono } from "hono";
import { z } from "zod";
import { SLUG_PATTERN } from "../lib/slug.js";
import type { KundliStore } from "../storage/types.js";

const citySchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  country: z.string().min(2).max(3),
  admin1: z.string().optional(),
  alternateNames: z.array(z.string()).optional(),
});

const livedCitySchema = citySchema.extend({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

const saveSchema = z.object({
  birthCity: citySchema,
  birthYear: z.number().int().min(1940).max(2099),
  livedCities: z.array(livedCitySchema).min(1),
  result: z.record(z.string(), z.unknown()),
});

const snapshotSchema = z.object({
  version: z.number().int().min(1),
  createdAt: z.string().datetime(),
  viewportWidth: z.number().int().min(320).max(2400),
  deviceScaleFactor: z.number().min(1).max(4),
  chunks: z.array(
    z.object({
      index: z.number().int().min(0),
      url: z.string().min(1),
      width: z.number().int().min(1).max(5000),
      height: z.number().int().min(1).max(6000),
    }),
  ).min(1),
});

const snapshotUpdateSchema = z.object({
  snapshot: snapshotSchema,
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export function createKundlisRoute(store: KundliStore): Hono {
  const route = new Hono();

  route.post("/", async (c) => {
    const parsed = saveSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ issues: parsed.error.issues }, 400);
    }

    try {
      const saved = await store.save(parsed.data);
      return c.json(
        {
          slug: saved.slug,
          birthCityDisplay: saved.birthCityDisplay,
          birthYear: saved.birthYear,
          createdAt: saved.createdAt,
        },
        201,
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          t: new Date().toISOString(),
          endpoint: "POST /kundlis",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return c.json({ error: "save_failed" }, 500);
    }
  });

  route.get("/", async (c) => {
    const parsed = listQuerySchema.safeParse({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    });

    if (!parsed.success) {
      return c.json({ issues: parsed.error.issues }, 400);
    }

    try {
      const items = await store.list(parsed.data.limit, parsed.data.offset);
      return c.json({ items });
    } catch (err) {
      console.error(
        JSON.stringify({
          t: new Date().toISOString(),
          endpoint: "GET /kundlis",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return c.json({ error: "list_failed" }, 500);
    }
  });

  route.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!SLUG_PATTERN.test(slug)) {
      return c.json({ error: "not_found" }, 404);
    }

    try {
      const saved = await store.getBySlug(slug);
      if (!saved) {
        return c.json({ error: "not_found" }, 404);
      }

      return c.json({
        slug: saved.slug,
        birthCityDisplay: saved.birthCityDisplay,
        birthYear: saved.birthYear,
        birthCity: saved.birthCity,
        livedCities: saved.livedCities,
        result: saved.result,
        snapshot: saved.snapshot,
        createdAt: saved.createdAt,
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          t: new Date().toISOString(),
          endpoint: "GET /kundlis/:slug",
          slug,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return c.json({ error: "fetch_failed" }, 500);
    }
  });

  route.put("/:slug/snapshot", async (c) => {
    const slug = c.req.param("slug");
    if (!SLUG_PATTERN.test(slug)) {
      return c.json({ error: "not_found" }, 404);
    }

    if (!isSnapshotUpdateAuthorized(c.req.header("authorization"))) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const parsed = snapshotUpdateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ issues: parsed.error.issues }, 400);
    }

    try {
      const saved = await store.updateSnapshot(slug, parsed.data.snapshot);
      if (!saved) {
        return c.json({ error: "not_found" }, 404);
      }

      return c.json({
        slug: saved.slug,
        snapshot: saved.snapshot,
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          t: new Date().toISOString(),
          endpoint: "PUT /kundlis/:slug/snapshot",
          slug,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return c.json({ error: "snapshot_update_failed" }, 500);
    }
  });

  return route;
}

function isSnapshotUpdateAuthorized(authorization: string | undefined): boolean {
  const token = process.env.KUNDLI_SNAPSHOT_TOKEN?.trim();
  if (!token) {
    return process.env.NODE_ENV !== "production";
  }
  return authorization === `Bearer ${token}`;
}
