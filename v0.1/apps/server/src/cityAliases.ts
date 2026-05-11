// Common city renames / colloquial spellings, scoped by country code.
//
// Resolution at the data layer happens on lat/lon (rounded to 4 decimals), so
// these aliases don't change the underlying cache or computed values — they
// only make the autocomplete UX honest about the fact that "Calcutta" and
// "Kolkata" refer to the same place.
//
// IMPORTANT: an alias only applies to the geocoder result whose ISO country
// code matches `country`. A tiny "Calcutta, Ohio, US" or "Bombay, New York"
// must NOT be re-labelled as the South Asian metro of the same name.

type AliasRule = {
  canonical: string;
  alsoKnownAs: string[];
  country: string; // ISO 3166-1 alpha-2
};

const ALIASES: Record<string, AliasRule> = {
  // South Asia
  calcutta:    { canonical: "Kolkata",   alsoKnownAs: ["Calcutta"],          country: "IN" },
  kolkata:     { canonical: "Kolkata",   alsoKnownAs: ["Calcutta"],          country: "IN" },
  bombay:      { canonical: "Mumbai",    alsoKnownAs: ["Bombay"],            country: "IN" },
  mumbai:      { canonical: "Mumbai",    alsoKnownAs: ["Bombay"],            country: "IN" },
  madras:      { canonical: "Chennai",   alsoKnownAs: ["Madras"],            country: "IN" },
  chennai:     { canonical: "Chennai",   alsoKnownAs: ["Madras"],            country: "IN" },
  bangalore:   { canonical: "Bengaluru", alsoKnownAs: ["Bangalore"],         country: "IN" },
  bengaluru:   { canonical: "Bengaluru", alsoKnownAs: ["Bangalore"],         country: "IN" },
  poona:       { canonical: "Pune",      alsoKnownAs: ["Poona"],             country: "IN" },
  pune:        { canonical: "Pune",      alsoKnownAs: ["Poona"],             country: "IN" },
  benares:     { canonical: "Varanasi",  alsoKnownAs: ["Benares", "Banaras"], country: "IN" },
  banaras:     { canonical: "Varanasi",  alsoKnownAs: ["Benares", "Banaras"], country: "IN" },
  varanasi:    { canonical: "Varanasi",  alsoKnownAs: ["Benares", "Banaras"], country: "IN" },
  cawnpore:    { canonical: "Kanpur",    alsoKnownAs: ["Cawnpore"],          country: "IN" },
  kanpur:      { canonical: "Kanpur",    alsoKnownAs: ["Cawnpore"],          country: "IN" },
  trivandrum:  { canonical: "Thiruvananthapuram", alsoKnownAs: ["Trivandrum"], country: "IN" },
  thiruvananthapuram: { canonical: "Thiruvananthapuram", alsoKnownAs: ["Trivandrum"], country: "IN" },
  cochin:      { canonical: "Kochi",     alsoKnownAs: ["Cochin"],            country: "IN" },
  kochi:       { canonical: "Kochi",     alsoKnownAs: ["Cochin"],            country: "IN" },
  mysore:      { canonical: "Mysuru",    alsoKnownAs: ["Mysore"],            country: "IN" },
  mysuru:      { canonical: "Mysuru",    alsoKnownAs: ["Mysore"],            country: "IN" },
  gurgaon:     { canonical: "Gurugram",  alsoKnownAs: ["Gurgaon"],           country: "IN" },
  gurugram:    { canonical: "Gurugram",  alsoKnownAs: ["Gurgaon"],           country: "IN" },
  // Vijayawada (AP). Open-Meteo's geocoder returns this entry under its
  // historical Telugu name "Bejawada", which confuses users typing the
  // modern name. Re-label so the dropdown shows "Vijayawada · also Bejawada".
  bejawada:    { canonical: "Vijayawada", alsoKnownAs: ["Bejawada"],         country: "IN" },
  vijayawada:  { canonical: "Vijayawada", alsoKnownAs: ["Bejawada"],         country: "IN" },
  // East / SE Asia
  peking:      { canonical: "Beijing",         alsoKnownAs: ["Peking"], country: "CN" },
  beijing:     { canonical: "Beijing",         alsoKnownAs: ["Peking"], country: "CN" },
  saigon:      { canonical: "Ho Chi Minh City", alsoKnownAs: ["Saigon"], country: "VN" },
  rangoon:     { canonical: "Yangon",          alsoKnownAs: ["Rangoon"], country: "MM" },
  yangon:      { canonical: "Yangon",          alsoKnownAs: ["Rangoon"], country: "MM" },
  // Europe
  istanbul:    { canonical: "Istanbul", alsoKnownAs: ["Constantinople"], country: "TR" },
  constantinople: { canonical: "Istanbul", alsoKnownAs: ["Constantinople"], country: "TR" },
  praha:       { canonical: "Prague",   alsoKnownAs: ["Praha"], country: "CZ" },
  prague:      { canonical: "Prague",   alsoKnownAs: ["Praha"], country: "CZ" },
};

export type AliasInfo = {
  canonical: string;
  alsoKnownAs: string[];
};

/** Apply alias only if the result's country code matches the canonical city's country. */
export function lookupAlias(
  name: string | null | undefined,
  countryCode: string | null | undefined,
): AliasInfo | null {
  if (!name) return null;
  const rule = ALIASES[name.trim().toLowerCase()];
  if (!rule) return null;
  if (!countryCode || countryCode.toUpperCase() !== rule.country) return null;
  return { canonical: rule.canonical, alsoKnownAs: rule.alsoKnownAs };
}

/**
 * If the user's typed query is a known historical/colloquial spelling whose
 * canonical name differs (e.g. "bombay" → "Mumbai", "saigon" → "Ho Chi Minh
 * City"), return the canonical name so the autocomplete can also search for
 * it and merge results. Returns null when the query already matches the
 * canonical, or when no alias is known.
 */
export function lookupCanonicalForQuery(query: string | null | undefined): string | null {
  if (!query) return null;
  const rule = ALIASES[query.trim().toLowerCase()];
  if (!rule) return null;
  if (rule.canonical.toLowerCase() === query.trim().toLowerCase()) return null;
  return rule.canonical;
}

// "Related queries" — distinct cities with confusable spellings that the
// geocoder's prefix match won't reach from a single search. Unlike ALIASES
// (which says X and Y are the *same* place), these are *different* places.
// Each typed query expands to extra searches so the famous near-spelling
// twins all surface; the user picks the right admin1 from the dropdown.
//
// Symmetry is required: if "amravati" expands to "amaravati", the inverse
// must also be listed so both spellings work.
const RELATED_QUERIES: Record<string, string[]> = {
  // Amravati (Maharashtra, ancient) vs Amaravati (Andhra Pradesh capital,
  // est. 2014). Different cities, near-identical spellings. Open-Meteo's
  // prefix match treats them as separate, so typing one hides the other.
  amravati:  ["amaravati"],
  amaravati: ["amravati"],
};

export function relatedQueriesFor(query: string | null | undefined): string[] {
  if (!query) return [];
  return RELATED_QUERIES[query.trim().toLowerCase()] ?? [];
}
