import { describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";

describe("GET /health", () => {
  it("returns cache readiness", async () => {
    const app = createApp();
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, cacheReady: true });
  });
});
