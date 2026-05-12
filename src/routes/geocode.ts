import { Hono } from "hono";
import { Budget } from "../lib/budget.js";
import type { Geocoder } from "../resolvers/geocoding.js";

export function createGeocodeRoute(geocoder: Geocoder): Hono {
  const route = new Hono();

  route.get("/", async (c) => {
    const q = c.req.query("q") ?? "";
    const results = q.trim() ? await geocoder.geocode(q, new Budget(3000)) : [];

    return c.json({ results });
  });

  return route;
}
