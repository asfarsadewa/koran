# Agent Review — 2026-08-15

Review of the `/kemarin` historical reconstruction pipeline after the Phase A/B work merged in PR #5.

## Executive summary

The implementation is materially stronger than the previous version.

The most important architectural improvement is the separation of **historical discovery** from **historical evidence**. Wikimedia is now treated primarily as a recall mechanism, evidence is classified by publisher/type/timing, GDELT is used as a geographic coverage-pressure signal rather than pretending to be a source of stories, and the collector emits diagnostics that make weak sourcing visible instead of silently hiding it.

That direction should be preserved.

Before adding a new newspaper provider, however, I recommend one small correctness pass. Three remaining rules are slightly more permissive than the editorial promise that `/kemarin` reconstructs only what a reader or editor could plausibly have known on the printed morning:

1. `adjacent` currently accepts an event dated **one day after** the printed date;
2. `ongoing` currently classifies any single-date event from the previous 30 days as still ongoing;
3. `contemporary` evidence can be published after the historical edition date, so “contemporary” is currently conflated with “available to the editor by press time”.

None of these undermine the new architecture. They are narrow semantic issues and can be corrected without redesigning the collector.

After those changes, Phase C should add a contemporary newspaper provider as both a **constrained secondary discovery source** and an **evidence source**. Using it only to enrich existing Wikimedia seeds will improve provenance but will not solve the measured recall problem on dates where Wikimedia produces zero exact candidates.

---

## What is now working well

### 1. Discovery and evidence are separate concerns

Candidates now carry explicit provenance and evidence metadata instead of treating a Wikipedia URL as both the reason an event was found and proof that its historical facts were available at the time.

The current candidate model exposes, among other fields:

- `discoveredBy`;
- evidence publisher;
- source type;
- evidence timing;
- independent corroboration;
- evidence score.

This is the correct foundation for historical reconstruction.

The key product benefit is that Eve can now distinguish:

- **why an event appeared in the candidate ledger**;
- **what sources actually support it**;
- **whether those sources were contemporary reporting or later historical writing**.

That distinction should remain explicit even as more providers are added.

### 2. GDELT was correctly re-scoped

The original plan imagined historical GDELT as a second candidate stream. The implementation spike showed why that is inappropriate for the 1991-era archive: rows contain event structure but not the headline/source material needed to write or substantiate a newspaper story.

Using GDELT instead as **coverage pressure** is a stronger design.

The current implementation asks a useful editorial question:

> Which countries experienced unusually high conflict activity relative to their own normal yearly baseline, and are any of those countries absent from the candidate ledger?

That makes GDELT a bias detector rather than a source.

This is especially good because raw event volume would tend to reward already heavily covered media centres. Comparing each country with its own baseline is much closer to the humanitarian editorial intent of Juara Merdeka.

The instruction that the GDELT signal must never become a story or evidence source is important and should remain hard-coded into the agent instructions.

### 3. The Wikimedia feed fixes were genuine correctness fixes

Two useful defects were uncovered during the work:

- the `selected` On This Day feed returns a `selected` array rather than `events`, so it had previously been silently discarded;
- feed descriptions should use the event line for that date, not the linked encyclopedia article summary.

Both fixes improve recall and reduce retrospective wording.

### 4. Diagnostics are becoming a first-class product feature

The collector now surfaces information such as:

- exact / adjacent / ongoing counts;
- candidates with contemporary evidence;
- candidates with independent corroboration;
- encyclopedia-only candidates;
- excluded future events;
- excluded old events;
- source failures and fallbacks;
- conflict-pressure countries not mentioned by any candidate.

This is excellent.

A historical agent should be able to say **“the archive is thin here”** rather than manufacture confidence. The present design is increasingly capable of doing that.

---

# Findings requiring a small correctness pass

## Finding 1 — `adjacent +1` still permits future knowledge

### Current behaviour

The date classifier currently treats:

- printed date: `exact`;
- previous date: `exact`;
- two days before: `adjacent`;
- **one day after: `adjacent`**.

Conceptually the current rule is:

```ts
if (startDelta === 1 || startDelta === -2) {
  return { fit: "adjacent", dayOffset: startDelta };
}
```

The tests intentionally preserve this behaviour; an event dated 14 August may remain eligible for a paper dated 13 August.

### Why this is a problem

The editorial objective is stronger than ordinary archival tolerance. `/kemarin` is not merely grouping events around a date. It is attempting to reconstruct a newspaper as if published on that historical morning.

A source may have timezone ambiguity around the **previous** date. That can reasonably justify `-1` or `-2` tolerance in some historical records.

But a calendar event dated **tomorrow** has not happened yet.

For a morning edition tied to the historical Perth print date, accepting `+1` means the collector itself allows future knowledge before Eve ever sees the candidate.

### Recommendation

Change the semantic boundary to:

```text
 0  -> exact
-1  -> exact
-2  -> adjacent
+1  -> reject
```

If a future source later proves that an incident crossed midnight or has a dateline mismatch, resolve that through explicit source metadata rather than a blanket `+1` allowance.

### Tests to change/add

- assert `+1` returns `null`;
- preserve `-2` as `adjacent`;
- add a regression asserting no collector result has `dayOffset > 0`;
- update fixtures currently using a next-day event as the adjacent example.

### Priority

**High.** Small code change, high semantic value.

---

## Finding 2 — `ongoing` currently means “recent” for many single-date events

### Current behaviour

The classifier correctly identifies a dated range that crosses the printed date as `ongoing`.

That is strong evidence that the underlying crisis was still active on the morning of publication.

However, the classifier also treats any single-date event from roughly the previous 30 days as `ongoing`:

```ts
if (startDelta < -2 && startDelta >= -ONGOING_LOOKBACK_DAYS) {
  return { fit: "ongoing", dayOffset: startDelta };
}
```

This means a discrete historical event can remain labelled `ongoing` purely because it occurred recently.

A test fixture currently demonstrates this with the `MTS Oceanos` sinking: the sinking occurred earlier in the month, but the candidate is classified as `ongoing` on a later edition date.

The aftermath may have remained newsworthy. The sinking itself was not still occurring.

### Why this matters

The current label communicates more certainty than the source provides.

There are two different editorial concepts here:

1. **ongoing** — the underlying crisis/event was demonstrably still active on the edition date;
2. **recent context** — the event happened before the edition and may still be editorially relevant, but continuation is not established.

Conflating them weakens the historical semantics Eve is now being instructed to respect.

### Preferred recommendation

Introduce a fourth fit:

```text
exact
adjacent
ongoing
recent
```

Use `ongoing` only where the source explicitly supports continuation, for example:

- a date range straddles the edition date;
- later enrichment explicitly establishes that the crisis was still active;
- a chronology line itself clearly describes a continuing condition and the parser can support that classification safely.

Use `recent` for discrete single-date events inside the historical lookback.

Suggested ranking:

```text
exact > adjacent > ongoing > recent
```

Whether `ongoing` should outrank `adjacent` can be revisited from real editions, but the semantic distinction matters more than the exact rank.

### Minimal alternative

If avoiding a schema expansion is preferred, stop admitting old single-date events automatically. Keep only:

- exact;
- adjacent historical dates;
- explicit date ranges crossing the edition date.

This will reduce recall, however, and the existing measurements already show recall is thin. For that reason the four-state model is preferable.

### Tests to change/add

- a single event 9 days earlier should be `recent`, not `ongoing`;
- a range beginning 9 days earlier and ending after the edition should remain `ongoing`;
- a single event beyond the recent lookback should be rejected;
- verify sorting remains deterministic across all four states.

### Priority

**High.** This is a naming/meaning bug more than a retrieval bug, but it directly affects Eve's interpretation of candidates.

---

## Finding 3 — “contemporary” is not the same as “available by edition time”

### Current behaviour

The evidence classifier uses a useful historiographical definition of contemporary evidence: a fully dated source close enough to the event can be labelled `contemporary`, while later historical writing is `retrospective` and uncertain dates remain `unknown`.

The current tolerance allows a source published after the event to remain contemporary for several weeks.

That is a reasonable definition for historical research.

However, `/kemarin` has an additional requirement:

> Could an editor producing this exact historical edition have had access to this information by press time?

Those are separate questions.

Example:

```text
event date:       1991-08-13
source published: 1991-08-14
edition date:     1991-08-13
```

The source is genuinely contemporary reporting about the event.

But it was not available to the editor of the 13 August edition.

### Why this matters

The current instructions correctly tell Eve not to use later-known casualty totals, investigation outcomes or retrospective labels.

But the evidence model itself does not yet expose the strongest primitive needed to enforce that rule.

A source can be:

- contemporaneous with the event;
- unavailable on the printed morning.

Without representing that distinction, the model has to infer it from dates every time.

### Recommendation

Keep the existing timing classification:

```text
contemporary
retrospective
unknown
```

Add an orthogonal field such as:

```ts
availableByEdition: boolean | "unknown"
```

The calculation should compare source publication date with the historical edition cutoff, not merely the event date.

If the exact historical press cutoff is not modelled, a conservative date-only rule is still useful:

```text
published before edition date -> available
published on edition date      -> unknown/conditional unless time is known
published after edition date   -> unavailable
```

If edition time is later modelled explicitly, this can become more precise.

### How Eve should use it

Suggested interpretation:

```text
contemporary + availableByEdition
    -> strongest evidence for facts printed in the reconstructed edition

contemporary + unavailableByEdition
    -> useful corroboration for whether the event really happened,
       but must not introduce facts first reported after the edition

retrospective
    -> background/context only; not sole support for edition-time facts

unknown
    -> weak support unless corroborated
```

This gives the agent a very simple historical-knowledge boundary.

### Scoring recommendation

Do not remove `contemporary` from the evidence score.

Instead add a stronger bonus for evidence that is both contemporary and available by the edition cutoff.

For example, conceptually:

```text
+ contemporary
++ availableByEdition
+++ contemporary AND availableByEdition
```

The exact numbers should be tuned only after observing real editions.

### Tests to add

- source dated before edition -> available;
- source dated after edition -> unavailable;
- same-day source without a timestamp -> unknown/conditional;
- retrospective source before edition should remain retrospective;
- archive wrapper should inherit the original publication date, not the archive capture date;
- Eve-facing output must render availability separately from timing.

### Priority

**High.** This is the cleanest way to make the “no historical omniscience” promise structurally enforceable.

---

# Recommended Phase A.1

Before adding another provider, I recommend one tightly scoped PR containing only the three semantic corrections above.

## Scope

1. reject `dayOffset > 0` from historical candidate eligibility;
2. split `recent` from `ongoing`, preferably by adding a fourth window-fit state;
3. add source availability relative to the historical edition date/time;
4. expose availability in the candidate ledger presented to Eve;
5. update instructions so Eve knows that contemporary-but-unavailable evidence is corroboration only;
6. update tests and fixtures.

## Explicit non-goals

Do **not** include in the same PR:

- NYT integration;
- another archive provider;
- GDELT changes;
- scoring overhaul beyond what is necessary for source availability;
- UI/layout changes;
- changes to the fixed eight-story edition contract.

This should remain a correctness PR, not a retrieval expansion PR.

---

# Phase C recommendation — change the role of the newspaper provider

The current plan says the first contemporary newspaper provider should attach matches as evidence to existing Wikimedia event seeds.

That is useful, but after the Phase A/B measurements it is no longer enough.

The observed problem is now clearly **recall**:

- sampled dates sometimes produce zero exact Wikimedia candidates;
- many candidates are not editorially relevant humanitarian stories;
- only a small subset have contemporary evidence;
- GDELT can reveal geographic pressure but cannot supply the missing article text.

If a newspaper provider only enriches existing Wikimedia seeds, it improves provenance but does not create missing exact-date events.

## Recommended Phase C behaviour

Use the first historical press provider in two constrained modes:

```text
historical press exact-date retrieval
        |
        +-- matches an existing event seed
        |       -> attach as evidence
        |
        +-- distinct serious event not already represented
                -> create a press-discovered candidate seed
```

This makes the provider both:

- a secondary discovery source;
- an evidence provider.

Wikimedia remains the broad chronology/index layer.

The press provider must not become the global definition of what mattered.

## Editorial guardrails

A press-discovered seed should still pass the same Juara Merdeka selection rules:

- meaningful negative human impact;
- event plausibly knowable by the historical edition cutoff;
- no sports/entertainment/trivia filler;
- evidence provenance retained;
- deduplicate against Wikimedia candidates;
- one newspaper's editorial geography must not override the GDELT coverage warning.

## Why NYT is still a sensible first spike

A mature historical archive with structured date search is convenient for validating the pipeline design.

Its main limitation is equally important: one American newspaper will reproduce its own historical coverage biases.

Therefore the spike should measure two different questions:

1. **Does this provider improve exact-date recall?**
2. **Which GDELT pressure countries remain absent even after adding it?**

That second measurement prevents a successful technical integration from being mistaken for globally representative coverage.

---

# Suggested implementation order

## PR A.1 — semantic correctness

- reject future `+1` candidates;
- introduce `recent` vs `ongoing`;
- add `availableByEdition`;
- update Eve instructions;
- update tests.

## PR C.0 — provider spike

Do not integrate into production selection yet.

For a small set of known historical dates, record:

- results returned by exact-date search;
- overlap with Wikimedia candidates;
- new serious events not represented in Wikimedia;
- how many results have usable publication timestamps;
- source URLs that remain resolvable;
- geographic distribution;
- overlap with GDELT pressure countries.

The spike should end with measured evidence about provider usefulness, not merely an API wrapper.

## PR C.1 — constrained provider integration

If the spike is worthwhile:

- enrich existing candidates;
- admit serious press-discovered seeds;
- deduplicate across discovery streams;
- preserve discovery provenance;
- expose provider failures in diagnostics;
- preserve the no-fabrication rule when GDELT identifies an uncovered country.

## Phase D — targeted archive enrichment

Only after Phase C has shown which candidates remain weakly sourced.

Use Internet Archive or equivalent as a targeted archaeological tool, not a blanket crawl on every edition.

---

# Acceptance criteria for the next correctness pass

The semantics should make all of the following statements true:

1. **No candidate can enter the ledger solely because it is dated after the printed date.**
2. **A discrete recent incident is not called `ongoing` unless continuation is actually supported.**
3. **A source can be contemporary but still marked unavailable to the editor of the historical edition.**
4. **Facts introduced only by unavailable sources cannot be treated as edition-time knowledge.**
5. **The model-facing ledger exposes these distinctions directly rather than requiring Eve to infer them from prose.**
6. **Diagnostics still report thin evidence rather than forcing false confidence.**

---

# Longer-term product decision still unresolved

The fixed requirement for exactly eight stories remains a real product constraint.

Current measurements indicate that some dates cannot naturally produce eight strong, contemporaneously sourced humanitarian stories from the existing archive set.

There are still three broad choices:

1. improve retrieval until eight is usually justified;
2. permit fewer than eight stories on historically thin days;
3. keep eight but explicitly surface sourcing weakness.

For now I would **not** change the eight-story schema.

Phase C should first answer how much of the shortage is a retrieval problem rather than a product-format problem.

If exact-date press discovery materially raises the number of defensible stories, the fixed layout may remain viable without changing the newspaper contract.

---

# Overall assessment

The Phase A/B changes were worthwhile and should be kept.

The system is now notably better at admitting uncertainty, which is more important than simply finding more historical facts. Discovery provenance, evidence timing, independent corroboration, provider diagnostics and GDELT coverage pressure give `/kemarin` a much more disciplined editorial core.

The next move should **not** be a large architectural expansion.

First make the historical knowledge boundary precise:

> no future event, no false `ongoing` label, and no source treated as available before it actually existed.

Then add the first contemporary press provider in a way that improves both evidence and recall.

That sequence keeps the distinctive product goal intact:

> `/kemarin` should feel less like today's encyclopedia remembering the past, and more like an intelligently reconstructed newspaper that knows only what its historical morning could plausibly have known.
