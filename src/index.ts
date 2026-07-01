import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { Hono } from "hono";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCache, type Cache } from "./cache/store.js";
import { loadEnvFile } from "./lib/load-env-file.js";
import { Telemetry } from "./lib/telemetry.js";
import { createAnalogResolver, loadAnalogIndex } from "./resolvers/analog.js";
import { createGeocoder, type Geocoder } from "./resolvers/geocoding.js";
import { createHistoricalResolver } from "./resolvers/historical.js";
import { createImdService } from "./resolvers/imd/resolver.js";
import { createProjectionResolver } from "./resolvers/projection.js";
import { loadStaticData, type StaticData } from "./resolvers/statics.js";
import type { AnalogIndex } from "./resolvers/analog.js";
import { createGeocodeRoute } from "./routes/geocode.js";
import { createHealthRoute } from "./routes/health.js";
import { createKundliRoute } from "./routes/kundli.js";
import { createKundlisRoute } from "./routes/kundlis.js";
import { createMonthlyDeltaRoute } from "./routes/monthly-delta.js";
import { createStatsRoute } from "./routes/stats.js";
import { createKundliStore, type KundliStore } from "./storage/index.js";

interface AppOptions {
  cache?: Cache;
  geocoder?: Geocoder;
  statics?: StaticData;
  telemetry?: Telemetry;
  kundliStore?: KundliStore;
  analogIndex?: AnalogIndex;
}

export function createApp(options: AppOptions = {}): Hono {
  const app = new Hono();
  const cache = options.cache ?? createCache();
  const geocoder = options.geocoder ?? createGeocoder({ cache });
  const telemetry = options.telemetry ?? new Telemetry();
  const statics = options.statics ?? loadStaticData();
  const historical = createHistoricalResolver({ cache });
  const imd = createImdService({ cache });
  const projection = createProjectionResolver({ cache });
  const analog = createAnalogResolver({ index: options.analogIndex ?? loadAnalogIndex() });
  const kundliStore = options.kundliStore ?? createKundliStore();

  app.use(
    "*",
    cors({
      origin: "*",
    }),
  );

  app.route("/kundli", createKundliRoute({ cache, statics, telemetry, historical, projection, analog }));
  app.route(
    "/kundlis",
    createKundlisRoute(kundliStore, {
      snapshotWebhookUrl: process.env.KUNDLI_SNAPSHOT_WEBHOOK_URL,
      snapshotWebhookSecret: process.env.KUNDLI_SNAPSHOT_WEBHOOK_SECRET,
      snapshotWebhookAuthorization: process.env.KUNDLI_SNAPSHOT_WEBHOOK_AUTHORIZATION,
      snapshotGithubRepo: process.env.KUNDLI_SNAPSHOT_GITHUB_REPO,
      snapshotGithubToken: process.env.KUNDLI_SNAPSHOT_GITHUB_TOKEN,
    }),
  );
  app.route("/monthly-delta", createMonthlyDeltaRoute({ historical, statics, imd, analog }));
  app.route("/geocode", createGeocodeRoute(geocoder));
  app.route("/stats", createStatsRoute(cache, telemetry));
  app.route("/health", createHealthRoute(true));

  return app;
}

loadEnvFile();

const app = createApp();

const isMain =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const port = Number(process.env.PORT ?? 8787);

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(JSON.stringify({ t: new Date().toISOString(), msg: "server_started", port: info.port }));
  });
}

export default app;
