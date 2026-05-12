import { Hono } from "hono";

export function createHealthRoute(cacheReady = true): Hono {
  const route = new Hono();

  route.get("/", (c) => {
    return c.json({ ok: true, cacheReady });
  });

  return route;
}
