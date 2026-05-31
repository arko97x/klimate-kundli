const IMD_API_BASE = process.env.IMD_API_BASE ?? "https://api.imd.gov.in";

/** How we authenticated (for logs / spike reports). */
export type ImdAuthMode =
  | "jwt-bearer"
  | "jwt-bearer+api-key"
  | "jwt-bearer+x-api-key"
  | "authorization-raw"
  | "authorization-bearer"
  | "x-api-key"
  | "api-key"
  | "x-api-key-upper";

export interface ImdCredentials {
  apiKey?: string;
  /** Session JWT from portal “Generate Sample JWT From Session” — goes in Authorization: Bearer */
  jwt?: string;
}

export interface ImdFetchResult {
  ok: boolean;
  status: number;
  authMode: ImdAuthMode;
  url: string;
  body: unknown;
  error?: string;
}

export function loadImdCredentials(): ImdCredentials {
  return {
    apiKey: process.env.IMD_API_KEY?.trim() || undefined,
    jwt: process.env.IMD_JWT_TOKEN?.trim() || undefined,
  };
}

/** Build header sets to try (portal test console uses JWT Bearer + API key field). */
export function imdAuthAttempts(creds: ImdCredentials): Array<{ mode: ImdAuthMode; headers: Record<string, string> }> {
  const attempts: Array<{ mode: ImdAuthMode; headers: Record<string, string> }> = [];

  if (creds.jwt && creds.apiKey) {
    // Portal test console fills both fields — try combined headers first.
    attempts.push(
      {
        mode: "jwt-bearer+api-key",
        headers: { Authorization: `Bearer ${creds.jwt}`, "api-key": creds.apiKey },
      },
      {
        mode: "jwt-bearer+x-api-key",
        headers: { Authorization: `Bearer ${creds.jwt}`, "X-API-KEY": creds.apiKey },
      },
    );
  }
  if (creds.jwt) {
    attempts.push({
      mode: "jwt-bearer",
      headers: { Authorization: `Bearer ${creds.jwt}` },
    });
  }

  if (creds.apiKey) {
    attempts.push(
      { mode: "authorization-raw", headers: { Authorization: creds.apiKey } },
      { mode: "authorization-bearer", headers: { Authorization: `Bearer ${creds.apiKey}` } },
      { mode: "api-key", headers: { "api-key": creds.apiKey } },
      { mode: "x-api-key-upper", headers: { "X-API-KEY": creds.apiKey } },
      { mode: "x-api-key", headers: { "X-Api-Key": creds.apiKey } },
    );
  }

  return attempts;
}

/** Call IMD with JWT Bearer (preferred) or legacy API-key probes. */
export async function imdFetchJson(
  path: string,
  creds: ImdCredentials | string,
): Promise<ImdFetchResult> {
  const auth: ImdCredentials = typeof creds === "string" ? { apiKey: creds } : creds;
  const url = path.startsWith("http") ? path : `${IMD_API_BASE}${path}`;
  const attempts = imdAuthAttempts(auth);

  if (attempts.length === 0) {
    return {
      ok: false,
      status: 0,
      authMode: "jwt-bearer",
      url,
      body: null,
      error: "IMD_JWT_TOKEN or IMD_API_KEY required",
    };
  }

  let last: ImdFetchResult = {
    ok: false,
    status: 0,
    authMode: attempts[0]!.mode,
    url,
    body: null,
    error: "no attempt",
  };

  for (const { mode, headers } of attempts) {
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

    if (res.status === 401) {
      continue;
    }

    return last;
  }

  return last;
}

/** Spike / diagnose: try every auth style (no secrets logged). */
export async function imdProbeAuthModes(
  path: string,
  creds: ImdCredentials | string,
): Promise<Array<{ mode: ImdAuthMode; status: number; error?: string }>> {
  const auth: ImdCredentials = typeof creds === "string" ? { apiKey: creds } : creds;
  const url = path.startsWith("http") ? path : `${IMD_API_BASE}${path}`;
  const out: Array<{ mode: ImdAuthMode; status: number; error?: string }> = [];

  for (const { mode, headers } of imdAuthAttempts(auth)) {
    const res = await fetch(url, { headers });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      // keep text
    }
    out.push({ mode, status: res.status, error: errorMessage(body) });
  }

  return out;
}

/** JWT payload `exp` (seconds) if decodable — for diagnose warnings only. */
export function jwtExpiresAtSec(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function errorMessage(body: unknown): string | undefined {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: unknown }).error;
    return typeof err === "string" ? err : undefined;
  }
  return undefined;
}
