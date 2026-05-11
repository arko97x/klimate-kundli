// /api/kundli — bundled 12-cell response.
//
// Accepts both GET and POST so the web app can POST a JSON body (more
// readable for multi-stay inputs) while curl users can hit GET with a
// simple comma-string for `lived`.
//
// Query/Body schema:
//   birth_slug  — string, required (place slug from /api/places)
//   birth_date  — string, required, YYYY-MM-DD
//   lived       — POST: array of { slug, start, end }
//                 GET : comma-separated triples "slug:start:end,slug2:start2:end2"
//                       use literal "today" for an open end (e.g. delhi-in:2018-08-01:today).

import { Hono } from "hono";
import { z } from "zod";
import { buildKundli } from "../kundli/build.js";

export const kundliRouter = new Hono();

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const LivedItem = z.object({
  slug: z.string().trim().min(1).max(64),
  start: DateStr,
  end: z.union([DateStr, z.literal("today")]),
});

const Input = z.object({
  birth_slug: z.string().trim().min(1).max(64),
  birth_date: DateStr,
  lived: z.array(LivedItem).default([]),
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseLivedGet(s: string | undefined) {
  if (!s) return [];
  return s.split(",").map((triple) => {
    const [slug, start, end] = triple.split(":");
    return { slug: slug ?? "", start: start ?? "", end: end ?? "today" };
  });
}

async function runRequest(c: import("hono").Context, parsed: z.infer<typeof Input>) {
  try {
    const result = await buildKundli({
      birthSlug: parsed.birth_slug,
      birthDate: parsed.birth_date,
      lived: parsed.lived.map((l) => ({
        slug: l.slug,
        start: l.start,
        end: l.end === "today" ? todayIso() : l.end,
      })),
    });
    return c.json(result);
  } catch (err) {
    const status = (err as { status?: number } | null)?.status ?? 500;
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, status as 400 | 404 | 500);
  }
}

kundliRouter.get("/", async (c) => {
  const parsed = Input.safeParse({
    birth_slug: c.req.query("birth_slug"),
    birth_date: c.req.query("birth_date"),
    lived: parseLivedGet(c.req.query("lived")),
  });
  if (!parsed.success) {
    return c.json({ error: "invalid query", issues: parsed.error.issues }, 400);
  }
  return runRequest(c, parsed.data);
});

kundliRouter.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
  }
  return runRequest(c, parsed.data);
});
