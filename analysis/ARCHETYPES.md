# Climate archetypes & "climate twins" — analysis handoff

**Status:** exploratory. Findings are solid; the proposed scheme is a first draft meant to be argued with.
**Data:** 320 saved kundlis from the Supabase `kundlis` table, pulled 2026-08-11.
**Reproduce everything here:** `node analysis/archetypes.mjs <dump.json>`
**Per-person labels:** `node analysis/archetypes.mjs <dump.json> --csv > labels.csv`

A note on the dump: birth year plus an ordered list of cities lived in is fairly
identifying, even without names. Worth keeping it off shared drives and out of the repo.

---

## The question we started with

> We want archetypes of people so we can build "climate twins." What kind of connection
> is most relevant — people who lived through *similar* climates, or *different* ones?

Short answer: **neither, as posed.** Both framings collapse. The connection worth
building is *same trajectory, different climate* — similar in the verb, different in
the noun. The rest of this doc is why.

---

## 0. What the corpus is

| | |
|---|---|
| rows | 320 |
| date span | 2026-06-29 → 2026-08-05 |
| **280 rows on Jul 3–5** | the exhibition |
| birth countries | IN 305, US 8, SG 2, then singletons (RS/GB/SA/OM/TH) |
| distinct birth cities | 146 |
| birth years | 1947–2016, median 1997 |
| entered >1 city | 197 (62%) |
| entered exactly 1 city | 123 (38%) |
| data quality | 269 `high` confidence, 45 `medium`, 6 `low`; sources era5 257 / nearest_city 51 / era5_seamless 12 |

⚠️ **Reconcile before citing:** our exhibition notes say 197 kundlis; the table says
280 rows over those three days. Different definitions somewhere (dedup? a filtered
subset? counted sessions not saves?). Don't put either number in public writing until
we know which is which.

---

## 1. Finding: climate features are ~entirely a property of the city, not the person

This is the load-bearing result, so here's the method in full.

14 birth cities have ≥5 people each (139 people total). For each feature I computed
total variance across everyone, and variance *within* each of those cities — i.e.
among people who share a birth city but differ in birth year and life path. The gap
is the ICC: the share of variation that is *between* cities.

| feature | total var | within-city var | **ICC (between-city)** |
|---|---|---|---|
| baseline temp | 9.28 | 0.02 | **100%** |
| seasonality range | 32.66 | 0.17 | **99%** |
| heavy-rain days Δ | 5.39 | 0.28 | **95%** |
| summer warming | 0.37 | 0.05 | **88%** |
| annual warming | 0.15 | 0.02 | **85%** |
| rainfall % change | 769.09 | 125.97 | **84%** |
| monsoon % change | 820.81 | 196.84 | **76%** |
| day/night asymmetry | 0.14 | 0.05 | **64%** |

And the leftover isn't a hidden generational signal. Demeaning each person's warming
by their city's mean and correlating against birth year gives **r = −0.056** (n=222).
Effectively zero. Per-city correlations swing wildly (−0.98 Kochi n=7, +0.97 Nashik
n=9, +0.09 Kolkata n=7) — that's small-n noise, not an effect.

The mechanism is straightforward: we compare a 5-year birth window against a 5-year
recent window, and year-to-year weather variance at that window size is comparable to
the 30-year trend we're trying to measure.

**Consequence:** any clustering on climate features is a geography classifier in a
costume. I confirmed this directly — k-means (k=5) on the climate signature returns
almost exactly the Indian Köppen zones (see §4). We would be spending a lot of
machinery to tell a visitor from Bangalore that they are from Bangalore.

---

## 2. Finding: migration outweighs warming by roughly 30×

`result.tempTimeline` is the useful field here — it tracks mean/peak temperature per
year and *follows the person across their moves*, so it encodes lived experience
rather than a fixed city's record.

Fitting OLS over each person's full timeline:

- median lived warming trend: **0.06 °C/decade** (p10 −1.03, p90 +0.94)
- median mover's temperature shift from relocating (last city segment − first): **2.1 °C**
  (p75 3.2, p90 9.4, max 17.6)
- **101 of 194 movers** shifted their lived temperature by more than 2 °C purely by moving

Extremes, to give the shape: a Chennai-born person across 6 cities ended up 17.6 °C
cooler; a Kolkata-born across 9 cities ended 14.6 °C warmer.

So for most people in this corpus, the climate they lived through changed because
*they* moved — not because the planet warmed. Warming is a 0.45 °C whisper underneath
a 21 °C spread of cities. That asymmetry is, I think, the most interesting thing in
the dataset and possibly the exhibit's real punchline.

---

## 3. Finding: three twin definitions, tested; two fail

**(a) Similar climate — degenerate.** Nearest neighbour in place-signature space is
*literally the same city* for **155/320 (48%)** of people, and the same state/region
for **239/320 (75%)**. This just introduces people to their neighbours.

**(b) Temporal analog ("you're living my birth climate") — drowned out.** 2,532
matching ordered pairs out of 102,080, but only **401** are same-city — the genuine
time-travel case. The rest are just other cities that happen to sit at that
temperature. Inevitable, given mean |warming| is 0.45 °C against a 21 °C city spread.
The signal we want is an order of magnitude below the noise floor of "which city."

**(c) Different climate — arbitrary.** Not worth a table: there's no principled
metric for "meaningfully opposite," and maximising distance just returns the one
Serbian or the Seattle person, every time, for everyone.

**(d) Trajectory — works.** How your lived climate moved is genuinely person-level.
The decisive test is whether people from the *same* birth city land in different
classes. They do:

| birth city | rooted | lateral | cooled | heated | unknown |
|---|---|---|---|---|---|
| Bengaluru (n=33) | 20 | 3 | 5 | 4 | 1 |
| Mumbai (n=18) | 9 | 4 | 4 | — | 1 |
| Chennai (n=12) | 7 | 1 | 4 | — | — |
| New Delhi (n=11) | 7 | 2 | — | 2 | — |
| Nashik (n=9) | 4 | 2 | 2 | 1 | — |

Overall: rooted 124, lateral 93, cooled 67, heated 34 (2 unknown — timelines under
8 years, i.e. the 2016-born).

---

## 4. Proposed scheme: Inheritance × Trajectory

Two axes, deliberately separating the thing you were dealt from the thing you did.

**Axis A — Inheritance** (the climate you didn't choose). k-means, k=5, on
`[baseline temp, seasonality range, log annual rainfall]`:

| zone | n | mean T | seasonality | rain | dominated by |
|---|---|---|---|---|---|
| temperate | 11 | 11.7 | 19.9 | 1287 | Belgrade, Chicago, SF, NY |
| continental-dry | 75 | 24.8 | 18.2 | 705 | Delhi, Jaipur, Lucknow |
| upland-equable | 67 | 23.9 | 6.7 | 919 | Bangalore, Nashik, Pune |
| hot-moderate | 95 | 26.8 | 11.2 | 1066 | Chennai, Hyderabad, Kolkata |
| wet-coastal | 72 | 26.3 | 4.9 | 2201 | Mumbai, Kochi, Thrissur |

**Axis B — Trajectory** (what your life did with it). Threshold on the temperature
difference between your first and last city segment:

- `rooted` — one city
- `lateral` — moved, shift within ±2 °C
- `cooled` — shift < −2 °C
- `heated` — shift > +2 °C

**Public-facing names.** The codes above are internal. The exhibit vocabulary is:

| code | shown as | meaning |
|---|---|---|
| `rooted` | Anchor | never moved |
| `lateral` | Wanderer | moved, climate held |
| `cooled` | **Renouncer** | moved cooler |
| `heated` | Seeker | moved hotter |
| *(none)* | Looper | went far, returned — **no classifier state produces this** |

`Renouncer` replaced `Escapee` (2026-09-02). Two reasons: `-ee` marks the passive party
in a set of `-er` agent nouns, so it was the one name that read as something done *to*
the visitor; and an escapee escapes custody, which is a heavier claim than moving from
Chennai to Bangalore. `Renouncer` keeps the agency and carries the *sannyasa* sense of
having given something up.

**Looper is aspirational.** Nothing in `archetypes.mjs` detects a return to origin — a
person who moved far and came home has `nCities > 1` and `shift ≈ 0`, so they classify
as `lateral` and would print as *Wanderer*. Supporting Looper needs a fifth branch in
`trajOf` (last-segment grid == birth grid **and** `trajCities > 1`), tested before the
`lateral` fallthrough. Cheap to add; not currently there.

**Cross-tab (n=320):**

| | rooted | lateral | cooled | heated |
|---|---|---|---|---|
| temperate | 1 | 1 | 0 | **9** |
| continental-dry | 30 | 31 | 6 | 8 |
| upland-equable | 33 | 18 | 7 | 8 |
| hot-moderate | 33 | 24 | **34** | 4 |
| wet-coastal | 27 | 19 | **20** | 5 |

Note the diagonal structure: hot origins produce `cooled` lives, and the temperate
(mostly foreign-born) group is 9/11 `heated`. The corpus has a visible "leaving the
heat / arriving into it" flow, which is a story on its own.

**Twin relation: same trajectory, different inheritance.** All 320 people have at
least one valid twin under this rule. The output is a sentence like *"you and this
stranger both walked out of the heat — from opposite ends of the country"* — which is
not recoverable from a map, and doesn't just restate where someone is from.

---

## 5. Where I'd push back on myself — open questions for you

1. **The `rooted` bucket is contaminated and I can't fix it post-hoc.** 123 people
   entered exactly one city. At a museum kiosk that's some mix of genuinely rooted
   lives and people who were in a hurry. It's the largest bucket (39%) and I don't
   trust it. This probably needs a UI change (an explicit "I've only ever lived here"
   confirmation) rather than an analysis fix.

2. **The ±2 °C threshold is eyeballed.** It sits near the median absolute shift (2.1),
   which is a defensible place to cut, but nothing deeper. Worth testing 1.5 / 2.5, or
   replacing the fixed cut with terciles of the observed shift distribution.
   `SHIFT_THRESHOLD_C` is a single constant at the top of the classifier.

3. **k=5 is a judgement call.** k=3 and k=4 are also coherent (k=4 merges the foreign
   group into the upland cluster). k=5 is the first k that isolates the non-India
   people rather than distorting an Indian cluster to absorb them.

4. **This scheme is India-shaped.** 11 non-India people fall into one degenerate
   catch-all. Fine for the exhibit; breaks immediately if this goes global.

5. **Drop rainfall from any archetype logic.** `rainPct` spans −60% to +145% at a
   5-year window. That's weather, not a lived signature. I excluded it from the
   clustering for this reason and would keep it excluded.

6. **Trajectory currently uses only first vs last city.** It throws away the shape of
   the middle — someone who went hot → cold → hot reads as `lateral`. A path-shape
   feature (total variation, or number of direction changes) might be better, but the
   n gets thin fast: only 44 people crossed a national border.

7. **Should `rooted` even be a trajectory class?** It's arguably the *absence* of one.
   An alternative framing: trajectory is a 3-class axis defined only over movers, and
   rootedness is a separate binary flag. Cleaner conceptually, but it means 39% of
   visitors get no trajectory archetype at all — which may be an exhibit problem.

---

## 6. Files

- `analysis/archetypes.mjs` — self-contained, no dependencies, Node ≥18. Reproduces
  every number above and emits per-person labels with `--csv`. Feature extraction is
  grouped into `place*` (city-determined) and `traj*` (person-determined) so the
  central distinction is visible in the code.
- Dump format expected: JSON array of `kundlis` rows. Header comment in the script has
  the PostgREST curl that produces it (note: PostgREST caps at 1000 rows per request).
