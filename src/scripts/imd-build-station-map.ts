/**
 * Refresh src/data/imd_station_map.json from IMD mapping APIs.
 * Requires working IMD auth on this machine.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadEnvFile } from "../lib/load-env-file.js";
import { hasImdAuthConfigured } from "../resolvers/imd/auth.js";
import { fetchStationCatalog } from "../resolvers/imd/resolver.js";
import type { ImdStationMapFile } from "../resolvers/imd/types.js";

async function main(): Promise<void> {
  loadEnvFile();
  if (!hasImdAuthConfigured()) {
    console.error("Set IMD_API_KEY + IMD_EMAIL/IMD_PASSWORD (or IMD_JWT_TOKEN). See docs/IMD_SETUP.md");
    process.exit(1);
  }

  const stations = await fetchStationCatalog();

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
