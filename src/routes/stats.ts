import { Hono } from "hono";
import type { Cache } from "../cache/store.js";
import type { Telemetry } from "../lib/telemetry.js";

export function createStatsRoute(cache: Cache, telemetry: Telemetry): Hono {
  const route = new Hono();

  route.get("/", (c) => {
    return c.json(telemetry.stats(cache.size(), cache.stats().hitRate));
  });

  return route;
}
