import { afterEach, describe, expect, it } from "vitest";

import {
  clearImdTokenCache,
  fetchImdOAuthToken,
  hasImdAuthConfigured,
  hasImdOAuthEnv,
  resolveImdCredentials,
} from "../src/resolvers/imd/auth.js";

const ENV_KEYS = ["IMD_API_KEY", "IMD_JWT_TOKEN", "IMD_EMAIL", "IMD_PASSWORD"] as const;

function saveEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
  clearImdTokenCache();
}

afterEach(() => {
  clearImdTokenCache();
});

describe("imd auth", () => {
  it("fetchImdOAuthToken parses success response", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          access_token: "eyJ.test.token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const token = await fetchImdOAuthToken("a@b.com", "secret", fetchImpl as typeof fetch);
    expect(token.access_token).toBe("eyJ.test.token");
    expect(token.expires_in).toBe(3600);
  });

  it("fetchImdOAuthToken throws on HTTP error", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });

    await expect(fetchImdOAuthToken("a@b.com", "bad", fetchImpl as typeof fetch)).rejects.toThrow(
      "IMD oauth HTTP 401",
    );
  });

  it("resolveImdCredentials uses oauth and caches token", async () => {
    const saved = saveEnv();
    process.env.IMD_API_KEY = "abc123key";
    process.env.IMD_EMAIL = "user@example.com";
    process.env.IMD_PASSWORD = "pass";
    delete process.env.IMD_JWT_TOKEN;

    let calls = 0;
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("oauth/token")) {
        calls++;
        return new Response(
          JSON.stringify({
            access_token: `token-${calls}`,
            token_type: "Bearer",
            expires_in: 3600,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    try {
      const first = await resolveImdCredentials(fetchImpl as typeof fetch);
      expect(first.apiKey).toBe("abc123key");
      expect(first.jwt).toBe("token-1");

      const second = await resolveImdCredentials(fetchImpl as typeof fetch);
      expect(second.jwt).toBe("token-1");
      expect(calls).toBe(1);
    } finally {
      restoreEnv(saved);
    }
  });

  it("hasImdAuthConfigured requires api key plus jwt or oauth", () => {
    const saved = saveEnv();
    try {
      delete process.env.IMD_API_KEY;
      delete process.env.IMD_JWT_TOKEN;
      delete process.env.IMD_EMAIL;
      delete process.env.IMD_PASSWORD;
      expect(hasImdAuthConfigured()).toBe(false);

      process.env.IMD_API_KEY = "key";
      expect(hasImdAuthConfigured()).toBe(false);

      process.env.IMD_EMAIL = "a@b.com";
      process.env.IMD_PASSWORD = "p";
      expect(hasImdAuthConfigured()).toBe(true);
      expect(hasImdOAuthEnv()).toBe(true);
    } finally {
      restoreEnv(saved);
    }
  });
});
