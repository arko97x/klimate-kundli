// Thin wrappers around /api/*. The dev server proxies /api → :3002 (see
// vite.config.ts), so we always use a relative path; in production behind
// Caddy this resolves to the same origin.

import type { KundliResponse, PlaceHit } from "./types";

const BASE = "/api";

class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!res.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `${res.status} ${res.statusText}`) || "request failed";
    throw new ApiError(res.status, message, payload);
  }
  return payload as T;
}

// /api/places?q=...
export async function searchPlaces(
  q: string,
  signal?: AbortSignal,
): Promise<PlaceHit[]> {
  if (q.trim().length === 0) return [];
  const url = `/places?q=${encodeURIComponent(q)}&limit=8`;
  const body = await fetchJson<{ results: PlaceHit[] }>(url, { signal });
  return body.results;
}

// /api/places/:slug — single resolution. Used when restoring a saved
// query-string-driven prefill so we can re-hydrate the form combobox
// without typing the city again.
export async function resolvePlace(slug: string): Promise<PlaceHit | null> {
  try {
    return await fetchJson<PlaceHit>(`/places/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// POST /api/kundli with a JSON body — the readable form for multi-stay
// inputs. We use POST (not GET) because some stays push the URL beyond
// ~512 chars at exhibition booths and Caddy/proxies don't love that.
export async function postKundli(input: {
  birthSlug: string;
  birthDate: string;
  lived: { slug: string; start: string; end: string }[];
}): Promise<KundliResponse> {
  return fetchJson<KundliResponse>("/kundli", {
    method: "POST",
    body: JSON.stringify({
      birth_slug: input.birthSlug,
      birth_date: input.birthDate,
      lived: input.lived,
    }),
  });
}

export { ApiError };
