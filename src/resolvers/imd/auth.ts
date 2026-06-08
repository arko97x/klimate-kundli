import type { ImdCredentials } from "./client.js";
import { jwtExpiresAtSec, loadImdCredentials } from "./client.js";

const IMD_OAUTH_URL =
  process.env.IMD_OAUTH_URL ?? "https://api.imd.gov.in/api/oauth/token.php";

/** Refresh this long before IMD's 3600s TTL. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface ImdOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

let cachedOAuthToken: { jwt: string; expiresAtMs: number } | null = null;

export function clearImdTokenCache(): void {
  cachedOAuthToken = null;
}

export function hasImdOAuthEnv(): boolean {
  return !!(process.env.IMD_EMAIL?.trim() && process.env.IMD_PASSWORD?.trim());
}

/** True when Prod key + (static JWT or portal login for oauth). */
export function hasImdAuthConfigured(): boolean {
  const { apiKey, jwt } = loadImdCredentials();
  if (!apiKey) {
    return false;
  }
  return !!(jwt || hasImdOAuthEnv());
}

export async function fetchImdOAuthToken(
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImdOAuthTokenResponse> {
  const res = await fetchImpl(IMD_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    // keep text
  }

  if (!res.ok) {
    const err =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : text.slice(0, 200);
    throw new Error(`IMD oauth HTTP ${res.status}: ${err}`);
  }

  if (!body || typeof body !== "object") {
    throw new Error("IMD oauth: invalid JSON response");
  }

  const token = body as Partial<ImdOAuthTokenResponse>;
  if (!token.access_token || typeof token.access_token !== "string") {
    throw new Error("IMD oauth: missing access_token");
  }

  return {
    access_token: token.access_token,
    token_type: token.token_type ?? "Bearer",
    expires_in: typeof token.expires_in === "number" ? token.expires_in : 3600,
  };
}

async function resolveJwt(fetchImpl: typeof fetch = fetch): Promise<string | undefined> {
  const email = process.env.IMD_EMAIL?.trim();
  const password = process.env.IMD_PASSWORD?.trim();

  if (email && password) {
    const now = Date.now();
    if (cachedOAuthToken && cachedOAuthToken.expiresAtMs - REFRESH_BUFFER_MS > now) {
      return cachedOAuthToken.jwt;
    }

    const fresh = await fetchImdOAuthToken(email, password, fetchImpl);
    cachedOAuthToken = {
      jwt: fresh.access_token,
      expiresAtMs: now + fresh.expires_in * 1000,
    };
    return cachedOAuthToken.jwt;
  }

  const staticJwt = process.env.IMD_JWT_TOKEN?.trim();
  if (!staticJwt) {
    return undefined;
  }

  const exp = jwtExpiresAtSec(staticJwt);
  if (exp && exp * 1000 <= Date.now()) {
    throw new Error(
      "IMD_JWT_TOKEN expired — set IMD_EMAIL + IMD_PASSWORD for auto-refresh, or regenerate JWT in portal",
    );
  }

  return staticJwt;
}

/** Load credentials; fetches/refreshes JWT via oauth when IMD_EMAIL/PASSWORD set. */
export async function resolveImdCredentials(fetchImpl: typeof fetch = fetch): Promise<ImdCredentials> {
  const { apiKey } = loadImdCredentials();
  const jwt = await resolveJwt(fetchImpl);
  return { apiKey, jwt };
}
