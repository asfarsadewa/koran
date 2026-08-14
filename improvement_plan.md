# Juara Merdeka — `/kemarin` Improvement Plan

## Purpose

`/kemarin` is one of Juara Merdeka's strongest ideas: every day's edition reconstructs the world as it might have been reported on the same calendar date 35 years earlier.

The current implementation is already a good first version. It deliberately shifts the Perth publication context back 35 calendar years, gathers historical candidates from Wikipedia/Wikimedia, ranks exact-date material ahead of nearby or same-month events, and asks the editorial agent to produce the edition in the historical present rather than as retrospective history.

The main improvement is not to replace this architecture. It is to separate **historical discovery** from **historical evidence**.

The target model should be:

> Wikimedia tells us what may have mattered. Independent contemporary or archival sources help establish what was actually known and reported at the time.

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

### Tier B — GDELT: add as a global event-discovery signal

GDELT's historical event archive reaches back to 1979, which comfortably covers Juara Merdeka's current 35-year offset. It is particularly attractive because the data is global and event-oriented rather than limited to famous historical anniversaries.

Recommended role:

- identify conflicts, protests, coercion, displacement, disasters and related events that may be absent from Wikipedia anniversary lists;
- improve geographic diversity;
- provide structured actors, locations and event types;
- help detect significant ongoing crises around the historical date.

Do **not** treat a GDELT event row as sufficient publication evidence by itself. Use it as another discovery/index signal.

Implementation note: start with a spike against GDELT 1.0 historical data before committing to a production integration. Determine the smallest practical date-bounded query or cached extraction suitable for an Eve run.

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

### Phase B — add GDELT discovery

Build a proof of concept that can retrieve and normalise events around one historical date.

Test against several known editions, including dates where Wikipedia has sparse non-Western coverage.

**Outcome:** candidate recall and geographic diversity improve.

### Phase C — add one contemporary newspaper provider

Spike NYT historical search first.

Do not use it as the global arbiter. Attach matches as evidence to existing event seeds.

**Outcome:** `/kemarin` begins to distinguish what was reported then from what is known now.

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

## Reference starting points

- GDELT Project: https://www.gdeltproject.org/
- GDELT data/documentation: https://www.gdeltproject.org/data.html
- Wikimedia API documentation migration notice: https://api.wikimedia.org/wiki/Community/About
- Wikimedia Feed API migration pointer: https://api.wikimedia.org/wiki/Feed_API
- New York Times developer portal: https://developer.nytimes.com/
- Internet Archive developers: https://archive.org/developers/
