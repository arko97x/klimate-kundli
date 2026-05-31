/**
 * Refresh src/data/imd_station_map.json from IMD mapping APIs.
 * Requires working IMD_API_KEY on this machine.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadEnvFile } from "../lib/load-env-file.js";
import { loadImdCredentials } from "../resolvers/imd/client.js";
import { fetchStationCatalog } from "../resolvers/imd/resolver.js";
import type { ImdStationMapFile } from "../resolvers/imd/types.js";

async function main(): Promise<void> {
  loadEnvFile();
  const creds = loadImdCredentials();
  if (!creds.jwt && !creds.apiKey) {
    console.error("Set IMD_JWT_TOKEN (and IMD_API_KEY) in .env. See docs/IMD_SETUP.md");
    process.exit(1);
  }

  const stations = await fetchStationCatalog(creds);
  if (stations.length === 0) {
    console.error("No stations returned — fix auth first (npm run imd:diagnose).");
    process.exit(1);
  }

  const map: ImdStationMapFile = {
    updatedAt: new Date().toISOString(),
    stations,
  };

  const outPath = join(process.cwd(), "src", "data", "imd_station_map.json");
  writeFileSync(outPath, `${JSON.stringify(map, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ msg: "imd_station_map_written", path: outPath, count: stations.length }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
