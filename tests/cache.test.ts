import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteCache } from "../src/cache/store.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempCachePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "klimate-cache-"));
  tempDirs.push(dir);
  return join(dir, "cache.sqlite");
}

describe("SqliteCache", () => {
  it("stores and reads JSON values", () => {
    const cache = new SqliteCache(tempCachePath());

    cache.set("city:delhi", { value: 47.9 });

    expect(cache.get<{ value: number }>("city:delhi")).toEqual({ value: 47.9 });
    expect(cache.stats()).toEqual({ hits: 1, misses: 0, hitRate: 1 });

    cache.close();
  });

  it("tracks misses and keeps has() out of hit-rate stats", () => {
    const cache = new SqliteCache(tempCachePath());

    expect(cache.has("missing")).toBe(false);
    expect(cache.get("missing")).toBeNull();
    expect(cache.stats()).toEqual({ hits: 0, misses: 1, hitRate: 0 });

    cache.close();
  });

  it("expires values by TTL and prunes stale rows", () => {
    const cache = new SqliteCache(tempCachePath());

    cache.set("old", { ok: false }, -1);
    cache.set("forever", { ok: true });

    expect(cache.get("old")).toBeNull();
    cache.prune();

    expect(cache.size()).toBe(1);
    expect(cache.get("forever")).toEqual({ ok: true });

    cache.close();
  });

  it("persists values across cache instances", () => {
    const path = tempCachePath();
    const first = new SqliteCache(path);
    first.set("hist:stats:v1:28.6:77.2:1993", { tmax: 47.9 });
    first.close();

    const second = new SqliteCache(path);

    expect(second.get("hist:stats:v1:28.6:77.2:1993")).toEqual({ tmax: 47.9 });

    second.close();
  });
});
