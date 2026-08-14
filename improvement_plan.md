# Juara Merdeka — `/kemarin` Improvement Plan

## Purpose

`/kemarin` is one of Juara Merdeka's strongest ideas: every day's edition reconstructs the world as it might have been reported on the same calendar date 35 years earlier.

The current implementation is already a good first version. It deliberately shifts the Perth publication context back 35 calendar years, gathers historical candidates from Wikipedia/Wikimedia, ranks exact-date material ahead of nearby or same-month events, and asks the editorial agent to produce the edition in the historical present rather than as retrospective history.

The main improvement is not to replace this architecture. It is to separate **historical discovery** from **historical evidence**.

The target model should be:

> Wikimedia tells us what may have mattered. Independent contemporary or archival sources help establish what was actually known and reported at the time.

## Status

Phases A and B have shipped. Phase B did not ship as written — the spike changed what GDELT could be, and §4 Tier B and §12 Phase B now record why.

**If you are picking this work up cold, read §18 first.** It holds the measured state of the ledger, the one product decision nobody has made yet, and the recommended order of work. The sections between here and there are the original reasoning, which is still sound except where a later section marks it corrected.

---

## 1. Preserve the parts that already work

Keep the following concepts unless implementation evidence later argues otherwise:

- `/kemarin` remains a distinct edition kind rather than a presentation filter over today's edition.
- Historical date is derived from the Perth publication date minus 35 calendar years.
- The agent writes as though the historical date is the present day.
- Eight stories are selected using the same humanitarian-impact standard as the current edition.
- Wikimedia remains a high-recall discovery source.
- The final edition is bilingual and published through the same edition pipeline and D1 store.
- Candidate collection remains deterministic and tool-driven rather than allowing the model to freely browse until it finds eight convenient stories.

These are good constraints. They keep the agent behaving like an editor rather than an unconstrained researcher.

---

## 2. Current weakness

The current historical collector uses closely related Wikimedia surfaces:

1. the relevant month section of the year chronology;
2. the calendar-day Wikipedia page;
3. Wikimedia `onthisday/events`;
4. Wikimedia `onthisday/selected`.

This produces a useful candidate ledger, but the same ecosystem is doing two jobs:

- **event discovery** — what happened around this date;
- **evidence** — what supports the facts in the eventual article.

`corroboratingUrls` currently comes primarily from URLs already embedded in Wikipedia wikitext. Those may be excellent sources, but they may also be retrospective articles, books, institutional histories, dead pages, or sources published years after the event.

Therefore the next version should treat Wikipedia citations as leads, not automatically as contemporaneous corroboration.

---

## 3. Desired architecture

```text
                       historical publication context
                                  |
                                  v
                         +------------------+
                         | discovery layer  |
                         +------------------+
                           |      |       |
                           v      v       v
                     Wikimedia  GDELT   other indexes
                           \      |      /
                            \     |     /
                             v    v    v
                           event seeds
                                |
                                v
                         +------------------+
                         | evidence layer   |
                         +------------------+
                           |      |       |
                           v      v       v
                     newspapers archives institutions
                           \      |      /
                            \     |     /
                             v    v    v
                          evidence bundles
                                |
                                v
                         editorial agent
                                |
                                v
                           eight stories
```

The model should curate **evidence bundles**, not raw search results.

---

## 4. Source strategy

### Tier A — Wikimedia: keep as the primary discovery layer

Use Wikimedia for recall, event naming, entity resolution, basic descriptions, and links to likely source material.

Do not require Wikimedia to prove every article.

Recommended role:

- generate event seeds;
- provide canonical event/article names;
- provide approximate dates;
- expose citations worth following;
- provide non-graphic contextual images when suitable.

### Tier B — GDELT: a coverage signal, not a discovery layer

GDELT's historical event archive reaches back to 1979, which comfortably covers Juara Merdeka's current 35-year offset. It is particularly attractive because the data is global and event-oriented rather than limited to famous historical anniversaries.

The spike this section asked for has now been run, and it settles the question of what GDELT can be here. Two findings matter:

**The historical rows carry no text.** A 1991 event row has 57 columns and none of them is `SOURCEURL` — that column only appears from 2013, when GDELT began ingesting the web. Of 4,374 events recorded for 15 August 1991, zero carry a URL. What a row does carry is an event code, two actors, coordinates and a tone score. That is enough to know something violent happened in a place; it is not enough to write a paragraph, and it can never be evidence.

So GDELT cannot be a peer of Wikimedia as a candidate generator for this era, and the diagram in §3 overstates it. A GDELT row cannot become an event seed with a title, a description and a URL, because it has none of the three.

**Raw volume measures wire attention, not violence.** The United States and United Kingdom lead the material-conflict count on almost every day of 1991. Ranking by volume would push the sheet toward the media centres the editorial standard exists to look past. Measuring each country against its own yearly baseline instead surfaces, for 15 August 1991: Burundi at 30×, Papua New Guinea at 24×, Cameroon at 21×, Guatemala at 7×, Gaza Strip at 7×. None of those appear anywhere in Wikipedia's August 1991 chronology.

Revised role:

- name the countries under unusual conflict on the printed day, and say which of them no candidate so much as mentions;
- lift candidates that do name such a country, so a Wikipedia entry about a genuine crisis outranks an entry about a cartoon channel;
- **never** serve as a source, a headline, or a reason to write a story that has no other support.

Access shape: the archive is one zip per year for 1979–2005 — 48 MB compressed and 395 MB of TSV for 1991 — with no per-day files and no byte-range support. Downloading that on every run to read one day is absurd, so the year is reduced once, offline, to per-day country anomalies and committed as a small generated module. See `scripts/build-gdelt-index.mjs`.

The honest limit: this improves what the desk *knows it is missing*. It does not supply the missing story. That still requires Tier C.

### Tier C — contemporary newspaper archive

Add at least one genuine newspaper archive that can return material published on or around the historical edition date.

The New York Times Article Search / Archive APIs are the first candidate to investigate because they expose a structured historical newspaper corpus. Treat this as one newspaper's view of the world, not as the global candidate pool.

Recommended role:

- provide contemporaneous headline/summary metadata;
- corroborate dates, places, casualty estimates and political context;
- demonstrate what was knowable at the time rather than only what later historians concluded.

Before implementation, verify current API access, quotas, archive coverage and permitted use/storage.

### Tier D — Internet Archive and similar archives

Use Internet Archive opportunistically when the event is already known and a targeted search can recover scans, OCR or archived contemporary material.

Recommended role:

- corroborate difficult or under-covered events;
- retrieve old periodicals or institutional documents;
- support stories where modern web archives have disappeared.

Do not make Internet Archive the first-pass candidate generator. OCR quality and inconsistent metadata make it better suited to targeted archaeological work.

### Tier E — authoritative institutional records

Prefer contemporary or near-contemporary records from bodies such as:

- UN agencies;
- Red Cross / Red Crescent organisations;
- WHO and health authorities;
- geological and meteorological agencies;
- national disaster agencies;
- governments and commissions of inquiry;
- established human-rights organisations.

These are particularly useful for death tolls, displacement, disease burden and disaster measurements.

---

## 5. Proposed data model

Replace the idea of a flat historical candidate with an event plus evidence bundle.

Illustrative shape:

```ts
interface HistoricalEventSeed {
  id: string;
  eventDate: string;
  title: string;
  description: string;
  geography?: string[];
  discoverySources: HistoricalSource[];
  windowFit: "exact" | "adjacent" | "ongoing";
}

interface HistoricalEvidence {
  url: string;
  publisher: string;
  publishedAt?: string;
  title?: string;
  snippet?: string;
  sourceType:
    | "contemporary-news"
    | "contemporary-institution"
    | "archive"
    | "encyclopedia"
    | "retrospective";
  contemporaneous: boolean;
}

interface HistoricalEvidenceBundle {
  seed: HistoricalEventSeed;
  evidence: HistoricalEvidence[];
  evidenceScore: number;
  hasIndependentCorroboration: boolean;
  hasContemporaryEvidence: boolean;
}
```

The exact schema is flexible. The important architectural change is that the curator receives explicit provenance and temporal classification.

---

## 6. Stop pretending historical data has timestamp precision

The current edition machinery shifts the present instant back 35 years and preserves a 36-hour editorial window. That is elegant for code reuse but historically misleading: most historical sources expose a **date**, not a precise publication/event timestamp.

For `/kemarin`, prefer date semantics:

1. **exact** — event occurred on the edition date;
2. **adjacent** — event occurred on the preceding/following day and plausibly belongs in that newspaper cycle;
3. **ongoing** — a major event or crisis was active during that period and materially relevant on the edition date.

The current `month` fallback is useful for recall, but it is too broad as an editorial concept. Rename/rework it into explicit ongoing-context logic where possible.

A historical story should not become eligible merely because something bad happened somewhere in the same month.

---

## 7. Evidence scoring

Introduce a lightweight deterministic score before the model sees the final candidate set.

Example dimensions:

- exact date match;
- contemporary source present;
- second independent source present;
- authoritative institution present;
- number of independent discovery systems that found the event;
- geographic specificity;
- strong humanitarian-impact keywords/structured event type;
- penalty for retrospective-only evidence;
- penalty for ambiguous dates;
- penalty for evidence sources that all ultimately derive from the same publisher.

The score should rank the ledger, not decide the edition. Eve still makes the editorial selection.

Avoid building an elaborate ML scoring model. A transparent weighted function is preferable here.

---

## 8. Editorial-agent changes

Update the `/kemarin` instructions so that Eve distinguishes three things explicitly:

### Discovery

How did we learn that this event may matter?

### Verification

What independent evidence supports the event and its key facts?

### Historical knowledge boundary

Was this information available on or near the historical edition date, or is it a fact learned only later?

The third point is particularly important.

The edition should avoid accidental historical omniscience. For example, if a disaster's final death toll became known weeks later, the historical edition should use the number credible at publication time or clearly state that the toll was still provisional.

This will make `/kemarin` feel like a newspaper rather than a modern encyclopedia dressed in old typography.

---

## 9. Proposed collection workflow

### Phase 1 — discovery

1. Build historical publication context.
2. Query Wikimedia year/month chronology.
3. Query calendar-day page.
4. Query Wikimedia On This Day feed.
5. Query GDELT historical events for the target date / narrow adjacent window.
6. Normalise and deduplicate into event seeds.

### Phase 2 — enrichment

For the highest-ranked seeds only:

1. inspect citations already exposed by Wikimedia;
2. query the contemporary-news source by date/event terms;
3. optionally query Internet Archive for targeted gaps;
4. collect authoritative institutional material where applicable;
5. classify every source as contemporary or retrospective.

### Phase 3 — ledger

Return perhaps 15–25 strong evidence bundles to Eve rather than hundreds of raw records.

### Phase 4 — editorial selection

Eve selects exactly eight using:

- humanitarian impact;
- confidence;
- historical-date relevance;
- geographic diversity;
- source quality;
- avoidance of duplicate developments from one crisis.

---

## 10. Source independence rules

Two URLs do not necessarily mean two independent sources.

Eventually add a simple provenance concept:

```ts
publisherGroup: "reuters"
```

or equivalent.

This prevents these combinations from being incorrectly treated as independent corroboration:

- Reuters original + newspaper syndication of the Reuters copy;
- AP original + outlet reproducing AP;
- Wikipedia + page whose only evidence is the same Wikipedia-derived text;
- two mirrors of one institutional press release.

Do not attempt perfect media-lineage detection in v2. Publisher/domain grouping plus obvious wire-service attribution will already improve quality substantially.

---

## 11. Wikimedia API migration risk

The Wikimedia API Portal is being retired/migrated during 2026 and its documentation is moving to MediaWiki.org.

The current `api.wikimedia.org/feed/v1/wikipedia/en/onthisday/...` integration should therefore get a small compatibility spike before further work depends on it.

Actions:

- confirm the supported replacement/current endpoint;
- update implementation and tests if necessary;
- keep the MediaWiki Action API year/month and day-page parsers as independent fallbacks;
- avoid coupling the collector to a single Wikimedia feed endpoint.

This is maintenance work, not a reason to abandon Wikimedia.

---

## 12. Delivery phases

### Phase A — strengthen current Wikimedia pipeline — **complete**

Small, low-risk changes:

- ~~replace `month` semantics with `ongoing` where supportable~~ — `exact` / `adjacent` / `ongoing`, classified by calendar distance rather than by the 36-hour instant window;
- ~~classify Wikipedia-extracted citations by publication date when metadata can be obtained~~ — read from `{{cite}}` date and year parameters, then from the URL path, with Wayback wrappers unwrapped to the original;
- ~~mark sources `contemporaneous` vs `retrospective`~~ — `contemporary` / `retrospective` / `unknown`, alongside publisher and source type; a bare year is never called contemporary;
- ~~include evidence metadata in model output~~ — the ledger prints publisher, type and timing per source, plus a per-run diagnostics block;
- ~~verify/migrate the On This Day endpoint~~ — the portal endpoint still answers; the per-wiki `rest_v1` route is now a fallback and a feed failure no longer aborts the sweep.

Three things were found during the work that the plan did not anticipate:

1. **The pipeline was reporting the future.** A baseline run for the edition of 15 August 1991 returned seventeen candidates, none matching the printed date and thirteen dated after it — the Soviet coup, Ukrainian independence, the Battle of Vukovar. Dropping future-dated events was therefore a correctness fix, not a tightening of editorial taste.
2. **`ongoing` needs the previous month.** An edition printed early in the month has no ongoing context inside its own month section, so the chronology for the preceding month is now read as well. Two extra requests.
3. **The `selected` feed had never been parsed.** It answers with a `selected` array rather than `events`, so one of the four discovery surfaces was silently returning nothing. Feed descriptions were also taking the linked article's summary instead of the day's own line.

**Outcome:** current system becomes more honest without adding another provider.

**Still open after Phase A:** many dates yield no `exact` candidate at all, because the Wikipedia day page carries no entry for that year. Recall, not honesty, is now the binding constraint — which is what Phase B is for.

### Phase B — add GDELT coverage pressure — **complete, re-scoped**

Originally written as "add GDELT discovery": retrieve and normalise events around one historical date, then feed them in as a second stream of candidates. The spike recorded in Tier B above shows that cannot work for this era — the rows have no headline, no summary and no URL — so Phase B shipped as a coverage signal instead.

What landed:

- `scripts/build-gdelt-index.mjs` reduces a year of the archive to per-day country anomalies, offline, and writes a generated module. 1991 and 1992 are built; the script must be re-run when the printed year rolls over, and an unindexed year is reported in the ledger rather than passing silently as a quiet day.
- The ledger names the countries under unusual conflict on the printed date and flags those no candidate mentions. The flag is stated as *no candidate names this country*, which is a fact about the text, rather than *this country is uncovered*, which the matching is not accurate enough to claim.
- Candidates naming a country under pressure gain a small ranking bonus.
- The instructions forbid treating the note as a source or as licence to write an unsupported story.

**Outcome:** geographic blind spots become visible. Recall does not improve — that is the honest limit of a source with no text, and the reason Phase C matters more than this plan originally implied.

### Phase C — add one contemporary newspaper provider

Spike NYT historical search first.

Do not use it as the global arbiter. Attach matches as evidence to existing event seeds.

**Outcome:** `/kemarin` begins to distinguish what was reported then from what is known now.

**Now the highest-value phase.** After Phases A and B the sheet is honest about what it knows and visibly aware of what it is missing, but it still has only one source of actual prose about the past. Many printed dates yield no `exact` candidate at all, and the countries GDELT flags are precisely the ones Wikipedia's chronology never covers. A provider with real headlines is the only thing that closes either gap. Note the tension to test in the spike: one American newspaper's archive will answer well for the countries its correspondents covered, which may not be Burundi or Papua New Guinea.

### Phase D — targeted archival enrichment

Add Internet Archive or another archive only for high-value candidates that still lack adequate contemporary evidence.

**Outcome:** deeper evidence without turning every run into an expensive archive crawl.

### Phase E — provenance and confidence tuning

After several weeks of real editions:

- inspect false positives;
- inspect events Eve consistently rejects;
- inspect over-represented countries;
- tune evidence scoring;
- add publisher grouping only where it fixes observed problems.

Do not build this phase from theory alone.

---

## 13. Test plan

Add fixture-driven tests around known dates.

At minimum cover:

### Date semantics

- exact edition date;
- previous day;
- next day;
- long-running crisis;
- irrelevant same-month event;
- leap-day behaviour for the 35-year calendar shift.

### Deduplication

- same event discovered by year chronology and On This Day;
- same event discovered by Wikimedia and GDELT;
- multiple articles about one incident;
- one wire story syndicated by multiple publications.

### Evidence

- two genuinely independent contemporary sources;
- contemporary + retrospective source;
- retrospective-only candidate;
- source with uncertain publication date;
- dead/archived source URL.

### Editorial regressions

Maintain a small set of historical edition snapshots and inspect:

- top candidate quality;
- geographic spread;
- ratio of exact vs adjacent/ongoing stories;
- number of stories with contemporary evidence;
- number relying on Wikipedia alone.

The goal is not exact deterministic story ranking. The goal is to catch obvious degradation in the candidate ledger.

---

## 14. Observability worth adding

Log per run:

- discovery sources queried;
- candidates per discovery source;
- deduplicated event count;
- evidence enrichment requests;
- candidates with contemporary evidence;
- candidates with two independent sources;
- exact / adjacent / ongoing distribution;
- selected story source distribution;
- provider failures and fallbacks.

This will make it possible to answer whether a new source actually improves the newspaper.

---

## 15. Things not to do yet

Avoid the following until real editions demonstrate a need:

- vector database for historical articles;
- custom crawler of the whole historical web;
- ingesting entire newspaper archives into D1;
- elaborate LLM-based source-reliability scoring;
- automatic OCR of arbitrary scanned newspapers on every run;
- paid enterprise archive contracts;
- replacing Eve's editorial judgment with a numerical ranker.

The interesting part of Juara Merdeka is the editor, not the retrieval stack.

---

## 16. Suggested first implementation PR after this plan — **landed**

Scope one code PR narrowly:

1. rename/rework historical window classification to `exact | adjacent | ongoing`;
2. introduce evidence/source-type fields in the historical candidate schema;
3. classify existing Wikimedia evidence as encyclopedia/retrospective/unknown rather than implicitly contemporaneous;
4. verify and, if required, migrate Wikimedia On This Day endpoint usage;
5. update Eve's instructions to prefer contemporary evidence and avoid historical omniscience;
6. add fixtures/tests for exact, adjacent and ongoing events.

Do **not** add GDELT and NYT in the same PR.

Once this foundation is merged, GDELT can arrive as a clean second discovery provider without forcing another schema redesign.

---

## 17. Definition of success

A successful `/kemarin` v2 should make this statement true:

> Opening Juara Merdeka on 14 August 2026 should feel less like reading Wikipedia's 2026 recollection of 14 August 1991, and more like opening an intelligently reconstructed newspaper on 14 August 1991 using information people plausibly had at the time.

That is the product identity worth protecting.

---

## 18. Where the work stands, and what to do next

Written after Phases A and B, for whoever picks this up next. Everything below that is stated as a measurement was measured against live Wikimedia and GDELT data, not reasoned about.

### What the ledger looks like now

Three printed dates, sampled after both phases landed:

| Printed date | Candidates | With contemporary evidence | Encyclopedia-only | `exact` |
|---|---|---|---|---|
| 1991-08-15 | 12 | 3 | 3 | 0 |
| 1991-08-03 | 13 | 5 | 2 | 0 |
| 1991-01-05 | 18 | 3 | 15 | 4 |

Two of the three dates produced **no candidate matching the printed day at all**. Roughly half of what does arrive is not humanitarian in the first place — a cartoon channel, a boxing result, a solar eclipse, the invention of the web — because that is what a year chronology contains.

### The decision nobody has made yet

The sheet requires exactly eight stories. On a typical date only three to five candidates carry contemporary evidence. The instruction added in Phase A — prefer contemporary evidence, avoid historical omniscience — therefore cannot be satisfied on most days. The editor fills the remaining slots from encyclopedia-only material because nothing else exists.

Three ways out:

1. **Find more material.** Phase C. Addressed below.
2. **Let the Kemarin sheet print fewer than eight on a thin day.** Be warned this is not a small change: `articleSchema` in `shared/edition.ts` requires exactly eight with ranks one through eight, the Chinese edition must match rank for rank, and the layout assumes the count.
3. **Keep eight and be transparent about thin sourcing** — say plainly in the sheet when a story rests on an encyclopedia alone.

The third is what happens today, by default, because nobody chose. It is a defensible answer but it should be chosen rather than inherited.

### Recommended order

**1. Publish about five editions and read them before building anything else.**

Nothing in this plan is worth more than looking at what the machine now produces. Both phases changed the ledger substantially and no human has read an edition made from it. The schedule already runs daily; `npm run agent:curate:kemarin` triggers one by hand. Read them against the diagnostics block the ledger now carries, and count two things: how many published stories rest on an encyclopedia alone, and how many are genuinely about human suffering rather than merely dated correctly.

§12 Phase E and §15 both say not to build from theory. This is that instruction applied to the plan itself.

**2. Spike NYT against the GDELT gap list. This is the single most informative experiment available.**

Both endpoints are live and reject only on a missing key, so a free developer key is the whole setup cost. Prefer `/svc/archive/v1/{year}/{month}.json`, which returns a month of article metadata in one request, over Article Search — it is the same reduce-once shape that worked for GDELT and it sidesteps per-query rate limits. Check the terms on storage before caching anything.

Run the spike this way round: take the countries GDELT flagged for 15 August 1991 — Burundi, Papua New Guinea, Cameroon, Guatemala, Gaza Strip — and ask whether the NYT archive for that month carries anything on them. That answers the question that decides Phase C's value: does a contemporary newspaper close the blind spots, or does it only deepen coverage where Wikipedia is already strong? One American paper's archive will answer well for the countries its correspondents were posted to, and those may not be these.

If the answer is "it deepens what we have", Phase C is still worth doing for evidence quality, but stop expecting it to fix geographic reach, and say so here.

**3. Fix candidate titles. Small, and worth doing whatever else happens.**

A candidate's title is currently the first wiki link in the bullet rather than the event, which yields entries called `Estonia`, `Prussian King`, `US Boxing` and `Finance Minister of India`. It is the first thing the editor reads and the key deduplication falls back on. See `parseYearMonthWikitext` in `agent/lib/historical-news.ts`.

**4. Leave Phase D alone until step 1 gives it a target.**

Internet Archive is archaeology for specific under-evidenced candidates. There are no identified candidates to chase yet.

**5. Phase E is correctly gated on weeks of real editions.** Do not start it early.

### Sources examined and set aside

**ReliefWeb** would be ideal on subject — humanitarian reporting, institutional sourcing, exactly this paper's beat. Its API now requires a registered appname, and its archive begins around its 1996 launch, so it does not reach the years currently printed. It becomes worth revisiting around 2031, when the 35-year offset catches up to it.

### Maintenance this sheet needs

GDELT is the only year-pinned resource in the pipeline. Wikipedia chronologies, calendar-day pages and the on-this-day feeds are all fetched by year at request time and need nothing.

The conflict index is generated and committed, currently covering 1991 and 1992, which carries the sheet through 2027. When the offset reaches 1993 on 1 January 2028 the index falls behind. Nothing breaks — `conflictPressureFor` returns null, the ledger reports `gdelt:1993 is not in the conflict index` among its failures, and the sheet publishes without coverage pressure — but that note is only ever read by the agent.

The alarm therefore lives in the test suite, in `tests/gdelt-conflict.test.ts`. It fails any build once the sheet is within 120 days of printing a year the index does not hold, and the failure message carries the exact command. It first rings in early September 2027. Rebuild with:

```
npm run gdelt:index -- 1991 1992 1993
```

Pass every year you want present; the file is rewritten rather than merged into. The run takes about ten seconds per year and is byte-for-byte reproducible.

---

## Reference starting points

- GDELT Project: https://www.gdeltproject.org/
- GDELT data/documentation: https://www.gdeltproject.org/data.html
- Wikimedia API documentation migration notice: https://api.wikimedia.org/wiki/Community/About
- Wikimedia Feed API migration pointer: https://api.wikimedia.org/wiki/Feed_API
- New York Times developer portal: https://developer.nytimes.com/
- Internet Archive developers: https://archive.org/developers/
