import { InMemoryKundliStore } from "./in-memory.js";
import { createSupabaseKundliStore } from "./supabase.js";
import type { KundliStore } from "./types.js";

export type { KundliListItem, KundliStore, SaveKundliInput, SavedKundli } from "./types.js";
export { InMemoryKundliStore } from "./in-memory.js";

export function createKundliStore(): KundliStore {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (url && key) {
    return createSupabaseKundliStore(url, key);
  }

  console.warn(
    JSON.stringify({
      t: new Date().toISOString(),
      msg: "kundli_store_in_memory",
      hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to persist kundlis",
    }),
  );

  return new InMemoryKundliStore();
}
