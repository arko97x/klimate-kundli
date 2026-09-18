# Klimate Kundli as a gathering mechanic — conference design

**Companion to `ARCHETYPES.md`.** That doc establishes *what* we can classify and why
(and is unchanged). This one is *what to do with it*.

**Reproduce every number here:** `node analysis/gathering.mjs <dump.json> --crowd 1500`

## Confirmed constraints

| | |
|---|---|
| venue | Bangalore — audience stays India-heavy, somewhat more foreign nationals than Vizchitra |
| crowd | ~1500 |
| format | **unmanned stations, screen only** |
| ruled out | no facilitator, no printed artefact, no physically sorting the room |

> **Version history.** v1 assumed an international crowd and a facilitated plenary.
> v2 corrected for the Bangalore venue. v3 responded to unmanned + screen-only, which
> invalidated the twin-hunt and the stage moment outright. **v4 (current)** switches
> retrieval from queue-adjacency to **pool matching**: you arrive whenever you like,
> generate your kundli, and the system then searches everyone who has been through so
> far. The scoring maths is unchanged; what changed is *who we score you against*, and
> it makes the mechanic strictly better.
> §4 records what was cut and why — worth reading before anyone re-proposes it.

---

## 1. THE RULE

### Part 1 — Classify

**Input (3 fields):** birth year · birth city · city you live in now

Ten seconds to enter. This is deliberately *not* the exhibit's full residency history:
the classifier only ever uses first-vs-last city, so the extra fields cost completion
rate and buy nothing. At the exhibit, with unhurried kiosk time, **39% of people still
entered only one city** — at conference tempo that would be worse, and under the old
input design those people got no archetype at all.

**Derive:**
- `T0` = mean annual temp of birth city, 5-yr window around birth year
- `T1` = mean annual temp of current city, recent 5-yr window
- `shift = T1 − T0`

**Trajectory** — the axis that is genuinely about the person:

| class | condition |
|---|---|
| `rooted` | one city entered (**not** birth == current — see `archetypes.mjs:118`) |
| `lateral` | \|shift\| ≤ 2 °C |
| `cooled` | shift < −2 °C |
| `heated` | shift > +2 °C |

**Inheritance** — k-means, k=5, on `[mean temp, seasonality range, log₁₀ annual rain]`
of the birth city. On our corpus these come out as *temperate · continental-dry ·
upland-equable · hot-moderate · wet-coastal*. **Freeze the five centroids from the
corpus and assign at runtime** — do not re-cluster live, or labels drift as the day
fills up.

**Archetype = Inheritance × Trajectory.** 20 cells.

### Part 2 — Connect

**Retrieval model:** a visitor arrives whenever they like and generates their kundli.
The system then scores them against **everyone who has been through the stations so
far** and surfaces the best few. No queue, no co-presence, no timing dependency.

For user **A** and every candidate **B** in the pool, compute all seven gaps below,
convert each to its corpus percentile, and take **A–B's score = its single highest
percentile**. Rank the pool by that score; surface the top few.

**Why ranking, not thresholds.** If you gate readings behind fixed thresholds, only
**53%** of arbitrary pairs get a reading at all — and 36 points of that is the boring
"you two are basically the same" case. Genuinely interesting readings cover just **18%
of arbitrary pairs**. Ranking sidesteps this entirely: you are choosing the best
candidate out of hundreds rather than accepting whoever turned up.

**How big does the pool need to be?** Small. Percentile of the strongest reading a
person can be offered:

| pool size | median person gets | worst-off person gets |
|---|---|---|
| 5 | 97.5th | 84.1th |
| 10 | 98.5th | 87.5th |
| 25 | 99.1th | 91.2th |
| 50 | 99.7th | 98.2th |
| 100 | 99.8th | 97.2th |
| 317 | 99.9th | 99.5th |

**By 50 people through the door, everybody gets a 98th-percentile connection.** Cold
start is a first-hour problem at most — and §5.4 (seeding with the Vizchitra 320)
removes even that.

**Still always output something.** For the first handful of visitors the pool is tiny,
so keep the fallback in the copy table below. Never show an empty state.

| dimension | formula | p50 | p90 | p97 |
|---|---|---|---|---|
| `converge` | \|T0ᴀ−T0ʙ\| − \|T1ᴀ−T1ʙ\| | 0.0 | 3.3 | 11.2 |
| `diverge` | \|T1ᴀ−T1ʙ\| − \|T0ᴀ−T0ʙ\| | 0.0 | 3.3 | 12.0 |
| `bornGap` | \|T0ᴀ − T0ʙ\| | 1.7 | 5.2 | 14.5 |
| `nowGap` | \|T1ᴀ − T1ʙ\| | 1.8 | 5.4 | 14.8 |
| `rainGap` | \|rainᴀ − rainʙ\| mm | 465 | 1692 | 2122 |
| `seasGap` | \|seasonalityᴀ − seasonalityʙ\| | 5.4 | 13.4 | 16.3 |
| `yearGap` | \|birthYearᴀ − birthYearʙ\| | 7 | 24 | 33 |

*(percentiles over all 50,403 pairs in the corpus)*

These are the **lookup table for converting a raw gap into a percentile** — not
thresholds to pass. Nothing is gated; every candidate gets a score and the ranking does
the rest. The columns are here so a reader can sanity-check a number by eye: a 5.2 °C
birth gap is a p90 pairing, a 14.5 °C one is p97.

**Tie-break priority** when percentiles fall within ~5 points of each other:

`converge` → `diverge` → same-trajectory → `rainGap` → `bornGap` → `nowGap` → `seasGap` → `yearGap`

Story-shaped readings beat raw gaps. `converge` leads because it produces the best
sentence in the set.

**Surfacing more than one person.** Show three connections, and **force each to win on
a different dimension** — take the top-scoring candidate, exclude its winning dimension,
re-rank, repeat. Without that constraint the top three are near-duplicates of each other.
With it, a visitor gets three genuinely different reasons to be interested in three
different strangers:

> *"One person here shares your exact path. One is your mirror image. One was born in
> the wettest place anyone here has come from."*

**Copy per winner:**

| winner | line |
|---|---|
| converge | *"They were born into a climate 9 °C from yours. You now live in the same weather."* |
| diverge | *"You started in the same climate. You're now 7 °C apart."* |
| same trajectory | *"You both walked out of the heat, from opposite ends of the country."* |
| rainGap | *"You grew up with 1.4 metres more rain a year than they did."* |
| bornGap / nowGap / seasGap / yearGap | plain comparison, same shape |

**Fallback when nothing clears p50:** state the shared fact — *"You were both born into
the same climate, 400 km apart."* Still true, still an opener.

### Implementation notes

- Freeze the percentile table as constants; don't recompute live. It's stable, and the
  conference corpus will be tiny in the first hours.
- Cache `T0`/`T1` **per city**, not per person. They're city-level properties — a few
  hundred cities covers everyone (this is the same fact that makes the whole
  classification work; see `ARCHETYPES.md` §1).

---

## 2. The station experience

**A. Your three connections — the backbone.** After the kundli, the screen shows the
three people from the whole day's pool you are most unusual alongside, each on a
different dimension (§1 Part 2): *"Someone here was born into a climate 9 °C from yours
— and now lives in the same weather you do."*

Zero social coordination, no facilitator, no pairing, no queue, no artefact. Works with
one screen and one person at a time, whenever they turn up. **It is the only mechanic
here that cannot fail operationally**, which is why it's the backbone rather than the
garnish.

Note what this is honestly doing: the people you are matched with have usually left the
station. The connection is *legible* rather than immediate — it tells you the strangers
in this building are readable in a way you didn't know about. Whether it converts into
an actual conversation depends on §5.2 (identity) more than on the matching.

**B. Accumulating ambient display.** The idle state shows everyone who has used the
station today; you find yourself in it. People standing near a screen with a shared
object talk to each other — oldest museum effect there is. Also solves cold start: it's
acceptable when nearly empty and improves as it fills.

**C. Duo mode — an option, never the default.** Two "start together" buttons for people
who arrive together (colleagues, friends), who then get the richer two-person reading.
Do **not** build the concept on strangers spontaneously co-operating at an unattended
kiosk; that is a large behavioural ask with nobody present to prompt it.

**D. The screen is the artefact.** Screen-only doesn't mean people leave with nothing —
they will photograph it. Design the final frame *to be photographed*: one strong claim,
legible at arm's length, KK branding in shot. That's the shareable token, free, and it
travels beyond the room.

---

## 3. Scale reality — say this to stakeholders

At ~60–90 seconds a session, one station serves **40–60 people per hour**. Across a
conference day that's a few hundred sessions per station. **You are not touching 1500
people — you're giving perhaps 15–25% of them a moment.**

That's fine, but it resets the goal from *"move the room"* to *"make the people who stop
talk to whoever is next to them."* Better to say so up front than to have it discovered
as a shortfall afterwards.

---

## 4. What we ruled out, and why

Recorded so nobody re-proposes these without new information.

**Matching people on climate *similarity*.** Nearest climate-neighbour is literally the
same city for **48%** of people and the same region for **75%**. It's a machine for
introducing Indians to other Indians — worse than random. Trajectory is the fix: it's
person-level, not place-level, and cuts across region, language and network.

**The twin hunt (same trajectory + different country).** Killed twice over. First by
asymmetry — the rule is **16.5× lopsided**, median pool of 2 for an India-born person
against 33 for a foreign-born one, so ~1300 people would hunt a few dozen foreigners who
then get mobbed. The zone-based repair (*same trajectory + different climate zone + birth
temps ≥3 °C apart*, pool ~47 at 1500, asymmetry 2.0×) was sound and works entirely within
India — but a hunt needs a way to *find* the person, and unmanned screen-only stations
provide none. Dead by constraint, not by logic. **If a badge or app ever appears, this
rule is ready to use.**

**The two-line stage moment.** Required a facilitator, a long flat room, and physically
sorting 1500 people. Ruled out by format. (For the record it was the strongest idea we
had: movers sorted by migration shift span 34.2 °C, non-movers sorted by lifetime warming
span 2.4 °C — a 14.5× contrast that makes the room the chart. Keep it for any future
event that *is* facilitated.)

**The chain.** "Your birth climate is someone's present climate" chains 200 people at
±0.5 °C — but the whole 200-person chain spans only **5.5 °C**. It's a clump at the modal
temperature wearing a gradient's clothes. If a gradient is ever wanted, just sort by
current climate and don't pretend the ordering encodes a relationship.

**Badges with archetype glyphs.** Depends on a printed artefact. Ruled out by format.

---

## 5. Open questions

1. **How many stations, and where?** Throughput (§3) is entirely a function of this.
   Note pool matching requires all stations to **share one pool** — they cannot be
   independent kiosks with local state.

2. **How does a visitor actually find the person they're matched with?** This is now
   the biggest unresolved question in the design, and it is a product question, not a
   maths one. The matching is solved; being *findable* is not. Options, roughly in
   order of cost:
   - nothing — the connection stays anonymous and the value is purely "these strangers
     are legible" (honest, cheap, and possibly enough)
   - a first name or an opt-in handle shown alongside the reading
   - a per-visitor code they can photograph, discoverable on the ambient display
   - opt-in contact exchange — highest value, highest privacy burden

   Whatever we choose determines whether KK is a *conversation starter* or a
   *conversation piece*. Both are legitimate; we should choose deliberately rather than
   discover the answer on the day.

3. **Privacy.** What's retained, for how long, and is it stated on the screen? Birth
   year plus two cities is fairly identifying, and this is 1500 strangers rather than a
   curated exhibit audience. Anything in Q2 beyond the first option raises this sharply.

4. **Seed the pool with the Vizchitra 320?** It removes cold start entirely (§1 Part 2)
   and makes the ambient display good from minute one. Against: those people aren't in
   the building, so a matched connection may be unreachable by construction. Possible
   split — seed the *ambient display*, match only against people present today.

5. **Any moment on stage at all,** or is KK purely ambient here? The talk can still
   *show* the two-line finding as a chart even though we can't stage it.
