import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

export interface Cache {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttlSec?: number): void;
  has(key: string): boolean;
  size(): number;
  stats(): CacheStats;
  prune(): void;
}

export class SqliteCache implements Cache {
  private readonly db: Database.Database;
  private hits = 0;
  private misses = 0;

  constructor(filePath = process.env.CACHE_PATH ?? "./data/cache.sqlite") {
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER,
        written_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_expires ON cache(expires_at);
    `);
  }

  get<T>(key: string): T | null {
    const row = this.db
      .prepare("SELECT value, expires_at FROM cache WHERE key = ?")
      .get(key) as { value: string; expires_at: number | null } | undefined;

    if (!row || this.isExpired(row.expires_at)) {
      if (row) {
        this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
      }
      this.misses += 1;
      return null;
    }

    try {
      this.hits += 1;
      return JSON.parse(row.value) as T;
    } catch {
      this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
      this.misses += 1;
      return null;
    }
  }

  set<T>(key: string, value: T, ttlSec?: number): void {
    const now = unixNow();
    const expiresAt = ttlSec === undefined ? null : now + ttlSec;

    this.db
      .prepare(
        `INSERT OR REPLACE INTO cache (key, value, expires_at, written_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(key, JSON.stringify(value), expiresAt, now);
  }

  has(key: string): boolean {
    const row = this.db
      .prepare("SELECT expires_at FROM cache WHERE key = ?")
      .get(key) as { expires_at: number | null } | undefined;

    if (!row || this.isExpired(row.expires_at)) {
      if (row) {
        this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
      }
      return false;
    }

    return true;
  }

  size(): number {
    this.prune();
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM cache").get() as { count: number };
    return row.count;
  }

  stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  prune(): void {
    this.db.prepare("DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at < ?").run(unixNow());
  }

  close(): void {
    this.db.close();
  }

  private isExpired(expiresAt: number | null): boolean {
    return expiresAt !== null && expiresAt < unixNow();
  }
}

export function createCache(filePath?: string): SqliteCache {
  return new SqliteCache(filePath);
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}
