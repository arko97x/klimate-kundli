const HOST_REWRITES: Record<string, string> = {
  "archive-api.open-meteo.com": "customer-archive-api.open-meteo.com",
  "climate-api.open-meteo.com": "customer-climate-api.open-meteo.com",
  "geocoding-api.open-meteo.com": "customer-geocoding-api.open-meteo.com",
  "api.open-meteo.com": "customer-api.open-meteo.com",
};

export function applyOpenMeteoCredentials(url: URL, apiKey: string | undefined = process.env.OPEN_METEO_API_KEY): URL {
  if (!apiKey) {
    return url;
  }

  const target = HOST_REWRITES[url.hostname];
  if (target) {
    url.hostname = target;
  }
  url.searchParams.set("apikey", apiKey);
  return url;
}
