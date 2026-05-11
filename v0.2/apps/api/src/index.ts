import { serve } from "@hono/node-server";
import { Hono } from "hono";

// v0.2 serving API. This is the skeleton entrypoint. Subsequent passes wire
// in Supabase reads, place lookup, and the kundli compute layer.
const app = new Hono();

app.get("/api/health", (c) =>
  c.json({ ok: true, version: "0.2.0-alpha.0", note: "skeleton" }),
);

const port = Number(process.env.PORT ?? 3002);
serve({ fetch: app.fetch, port }, () => {
  console.log(`[api] v0.2 listening on http://localhost:${port}`);
});
