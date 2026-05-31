const IMD_API_BASE = process.env.IMD_API_BASE ?? "https://api.imd.gov.in";

export type ImdAuthMode = "authorization-raw" | "authorization-bearer" | "x-api-key";

export interface ImdFetchResult {
  ok: boolean;
  status: number;
  authMode: ImdAuthMode;
  url: string;
  body: unknown;
  error?: string;
}

/** Try auth styles until one works (portal docs are sparse). */
export async function imdFetchJson(path: string, apiKey: string): Promise<ImdFetchResult> {
  const url = path.startsWith("http") ? path : `${IMD_API_BASE}${path}`;
  const modes: ImdAuthMode[] = ["authorization-raw", "authorization-bearer", "x-api-key"];

  let last: ImdFetchResult = {
    ok: false,
    status: 0,
    authMode: "authorization-raw",
    url,
    body: null,
    error: "no attempt",
  };

  for (const mode of modes) {
    const headers = authHeaders(mode, apiKey);
    const res = await fetch(url, { headers });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      // keep text
    }

    const errMsg = errorMessage(body);
    last = { ok: res.ok, status: res.status, authMode: mode, url, body, error: errMsg };

    if (res.ok) {
      return last;
    }

    // Wrong auth shape → try next mode
    if (res.status === 401 && errMsg?.toLowerCase().includes("authorization header")) {
      continue;
    }
    if (res.status === 401 && errMsg?.toLowerCase().includes("api key missing")) {
      continue;
    }

    return last;
  }

  return last;
}

export function authHeaders(mode: ImdAuthMode, apiKey: string): Record<string, string> {
  switch (mode) {
    case "authorization-bearer":
      return { Authorization: `Bearer ${apiKey}` };
    case "x-api-key":
      return { "X-Api-Key": apiKey };
    default:
      return { Authorization: apiKey };
  }
}

function errorMessage(body: unknown): string | undefined {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: unknown }).error;
    return typeof err === "string" ? err : undefined;
  }
  return undefined;
}
