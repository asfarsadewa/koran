/**
 * A second discovery surface for the Kemarin sheet.
 *
 * The year chronology is a short editorial digest — a few dozen lines a month, most
 * of them diplomacy — so a sheet built from it alone ran to one or two stories. The
 * harm categories for the printed year (disasters, attacks, massacres, battles,
 * conflicts, riots) list hundreds of articles, and Wikidata carries the dates that
 * let each one be placed against the printed day without reading its prose.
 *
 * Only a date recorded to the day may place an event on the page. A month or a year
 * is used solely to prove that something began before the printed day and was still
 * open after it; anything that could have fallen after the presses ran is dropped.
 */
import { formatIsoDate, parseIsoDate } from "../../shared/calendar";
import { isLikelyHistoricalSourceUrl } from "../../shared/edition";
import type { ParsedHistoricalEvent } from "./historical-news";
import {
  classifyWindowFit,
  dayDelta,
  RECENT_LOOKBACK_DAYS,
  type DateParts,
  type WindowFitResult,
} from "./historical-window";
import { record, text, wikiApiUrl, wikimediaGet, wikipediaArticleUrl } from "./wikimedia";

export const CATEGORY_DISCOVERY = "wikipedia:category";

/** The roots read for a year. Each is read with its direct subcategories. */
export function harmCategoryRoots(year: number): string[] {
  return [
    `${year} disasters`,
    `Attacks in ${year}`,
    `Massacres in ${year}`,
    `Battles in ${year}`,
    `${year} conflicts`,
    `${year} riots`,
    `${year} mass murders`,
  ];
}

/** `… by country` and `… by continent` only nest further lists, never articles. */
const INDEX_SUBCATEGORY = /\bby (?:country|continent|city|type|year|month)\b/iu;

/** A bound on the articles sent to Wikidata, so a crowded year cannot run away. */
export const MAX_CATEGORY_ARTICLES = 900;

const WIKIDATA_BATCH = 50;
const EXTRACT_BATCH = 20;

export interface CategorySweepDiagnostics {
  categories: number;
  articles: number;
  kept: number;
  future: number;
  tooOld: number;
  /** Dated only to a month or year that straddles the printed day. */
  imprecise: number;
  undated: number;
}

export interface CategorySweepResult {
  events: ParsedHistoricalEvent[];
  requests: number;
  diagnostics: CategorySweepDiagnostics;
  failures: string[];
}

/* -------------------------------------------------------------------------- */
/* Wikidata dates                                                             */
/* -------------------------------------------------------------------------- */

/** The earliest and latest day a Wikidata time value can stand for. */
export interface DateSpan {
  earliest: DateParts;
  latest: DateParts;
  /** True only when the value names a single day. */
  precise: boolean;
}

const DAY_PRECISION = 11;
const MONTH_PRECISION = 10;
const YEAR_PRECISION = 9;

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function wikidataSpan(value: unknown): DateSpan | null {
  const data = record(value);
  const time = text(data?.time);
  const precision = typeof data?.precision === "number" ? data.precision : 0;
  const match = time ? /^\+(\d{4})-(\d{2})-(\d{2})T/u.exec(time) : null;
  if (!match || precision < YEAR_PRECISION) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (precision >= DAY_PRECISION) {
    const parts = parseIsoDate(formatIsoDate({ year, month, day }));
    return parts ? { earliest: parts, latest: parts, precise: true } : null;
  }
  if (precision === MONTH_PRECISION && month >= 1 && month <= 12) {
    return {
      earliest: { year, month, day: 1 },
      latest: { year, month, day: lastDayOfMonth(year, month) },
      precise: false,
    };
  }
  return {
    earliest: { year, month: 1, day: 1 },
    latest: { year, month: 12, day: 31 },
    precise: false,
  };
}

export interface EventDates {
  point?: DateSpan | null;
  start?: DateSpan | null;
  end?: DateSpan | null;
}

export type SpanPlacement =
  | ({ kind: "placed" } & WindowFitResult & { begin: DateParts })
  | { kind: "future" | "too-old" | "imprecise" | "undated" };

/**
 * Places an event against the printed day using only what its dates can prove.
 * A range is `ongoing` only if its earliest possible end still reaches the printed
 * day; an end known only to the month is not taken as proof the fighting went on.
 */
export function placeEventDates(edition: DateParts, dates: EventDates): SpanPlacement {
  const begin = dates.point ?? dates.start ?? null;
  if (!begin) return { kind: "undated" };
  if (dayDelta(edition, begin.earliest) > 0) return { kind: "future" };
  if (dayDelta(edition, begin.latest) > 0) return { kind: "imprecise" };

  const end = dates.point ? null : (dates.end ?? null);
  const stillOpen = end ? dayDelta(edition, end.earliest) >= 0 : false;

  if (begin.precise) {
    const fit = classifyWindowFit(edition, begin.earliest, stillOpen ? end?.earliest : null);
    return fit ? { kind: "placed", ...fit, begin: begin.earliest } : { kind: "too-old" };
  }
  if (stillOpen) {
    return {
      kind: "placed",
      fit: "ongoing",
      dayOffset: dayDelta(edition, begin.earliest),
      begin: begin.earliest,
    };
  }
  // Begun at some point in a month or year and not shown to be still running: it
  // cannot be placed inside the lookback, and it may well lie far outside it.
  return dayDelta(edition, begin.latest) < -RECENT_LOOKBACK_DAYS
    ? { kind: "too-old" }
    : { kind: "imprecise" };
}

function firstClaimValue(claims: Record<string, unknown> | null, property: string): unknown {
  const list = claims?.[property];
  if (!Array.isArray(list)) return null;
  const usable = list
    .map(record)
    .filter((claim) => claim && claim.rank !== "deprecated")
    .sort((left, right) => Number(right?.rank === "preferred") - Number(left?.rank === "preferred"));
  return record(record(usable[0]?.mainsnak)?.datavalue)?.value ?? null;
}

export function entityDates(entity: unknown): EventDates {
  const claims = record(record(entity)?.claims);
  return {
    point: wikidataSpan(firstClaimValue(claims, "P585")),
    start: wikidataSpan(firstClaimValue(claims, "P580")),
    end: wikidataSpan(firstClaimValue(claims, "P582")),
  };
}

/* -------------------------------------------------------------------------- */
/* Sweep                                                                      */
/* -------------------------------------------------------------------------- */

interface CategoryMember {
  title: string;
  wikidataId?: string;
}

async function readCategory(
  name: string,
  signal: AbortSignal | undefined,
): Promise<{ pages: CategoryMember[]; subcategories: string[] }> {
  const body = record(
    await wikimediaGet(
      wikiApiUrl({
        action: "query",
        generator: "categorymembers",
        gcmtitle: `Category:${name}`,
        gcmtype: "page|subcat",
        gcmlimit: "500",
        prop: "pageprops",
        ppprop: "wikibase_item",
      }),
      signal,
    ),
  );
  const members = Array.isArray(record(body?.query)?.pages)
    ? (record(body?.query)?.pages as unknown[])
    : [];
  const pages: CategoryMember[] = [];
  const subcategories: string[] = [];
  for (const raw of members) {
    const member = record(raw);
    const title = text(member?.title);
    if (!title) continue;
    if (member?.ns === 14) {
      subcategories.push(title.replace(/^Category:/u, ""));
    } else if (member?.ns === 0) {
      const wikidataId = text(record(member?.pageprops)?.wikibase_item);
      pages.push({ title, ...(wikidataId ? { wikidataId } : {}) });
    }
  }
  return { pages, subcategories };
}

interface ArticleSummary {
  extract: string;
  imageUrl?: string;
}

async function readSummaries(
  titles: string[],
  signal: AbortSignal | undefined,
): Promise<Map<string, ArticleSummary>> {
  const body = record(
    await wikimediaGet(
      wikiApiUrl({
        action: "query",
        prop: "extracts|pageimages",
        exintro: "1",
        explaintext: "1",
        exsentences: "3",
        exlimit: String(EXTRACT_BATCH),
        piprop: "thumbnail",
        pithumbsize: "640",
        pilimit: String(EXTRACT_BATCH),
        titles: titles.join("|"),
      }),
      signal,
    ),
  );
  const pages = Array.isArray(record(body?.query)?.pages)
    ? (record(body?.query)?.pages as unknown[])
    : [];
  const summaries = new Map<string, ArticleSummary>();
  for (const raw of pages) {
    const page = record(raw);
    const title = text(page?.title);
    const extract = text(page?.extract);
    if (!title || !extract) continue;
    const thumbnail = text(record(page?.thumbnail)?.source);
    summaries.set(title, {
      extract: extract.replace(/\s+/gu, " ").slice(0, 600),
      ...(thumbnail?.startsWith("https:") ? { imageUrl: thumbnail } : {}),
    });
  }
  return summaries;
}

function eventDateIso(parts: DateParts): string {
  return `${formatIsoDate(parts)}T12:00:00.000Z`;
}

export async function sweepHarmCategories(
  editionDate: string,
  signal?: AbortSignal,
): Promise<CategorySweepResult> {
  const edition = parseIsoDate(editionDate);
  const diagnostics: CategorySweepDiagnostics = {
    categories: 0,
    articles: 0,
    kept: 0,
    future: 0,
    tooOld: 0,
    imprecise: 0,
    undated: 0,
  };
  const failures: string[] = [];
  let requests = 0;
  if (!edition) return { events: [], requests, diagnostics, failures };

  // January reaches back into December, which belongs to the previous year's lists.
  const years =
    edition.month === 1 && edition.day <= RECENT_LOOKBACK_DAYS
      ? [edition.year, edition.year - 1]
      : [edition.year];
  const queue = years.flatMap(harmCategoryRoots).map((name) => ({ name, depth: 0 }));
  const visited = new Set<string>();
  const members = new Map<string, CategoryMember>();

  while (queue.length) {
    const next = queue.shift();
    if (!next || visited.has(next.name)) continue;
    visited.add(next.name);
    requests += 1;
    try {
      const { pages, subcategories } = await readCategory(next.name, signal);
      diagnostics.categories += 1;
      for (const page of pages) members.set(page.title, page);
      if (next.depth === 0) {
        for (const name of subcategories) {
          if (!INDEX_SUBCATEGORY.test(name)) queue.push({ name, depth: 1 });
        }
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      failures.push(`category:${next.name} ${(error as Error).message}`);
    }
  }

  const byEntity = new Map<string, string>();
  for (const member of [...members.values()].slice(0, MAX_CATEGORY_ARTICLES)) {
    if (member.wikidataId) byEntity.set(member.wikidataId, member.title);
  }
  diagnostics.articles = members.size;
  diagnostics.undated += members.size - byEntity.size;

  const placed: { title: string; placement: Extract<SpanPlacement, { kind: "placed" }> }[] = [];
  const ids = [...byEntity.keys()];
  for (let index = 0; index < ids.length; index += WIKIDATA_BATCH) {
    const batch = ids.slice(index, index + WIKIDATA_BATCH);
    requests += 1;
    let entities: Record<string, unknown> | null;
    try {
      const url = new URL("https://www.wikidata.org/w/api.php");
      url.search = new URLSearchParams({
        action: "wbgetentities",
        ids: batch.join("|"),
        props: "claims",
        format: "json",
      }).toString();
      entities = record(record(await wikimediaGet(url, signal))?.entities);
    } catch (error) {
      if (signal?.aborted) throw error;
      failures.push(`wikidata:batch ${index / WIKIDATA_BATCH + 1} ${(error as Error).message}`);
      continue;
    }
    for (const id of batch) {
      const title = byEntity.get(id);
      if (!title) continue;
      const placement = placeEventDates(edition, entityDates(entities?.[id]));
      if (placement.kind === "placed") placed.push({ title, placement });
      else if (placement.kind === "future") diagnostics.future += 1;
      else if (placement.kind === "too-old") diagnostics.tooOld += 1;
      else if (placement.kind === "imprecise") diagnostics.imprecise += 1;
      else diagnostics.undated += 1;
    }
  }

  const summaries = new Map<string, ArticleSummary>();
  for (let index = 0; index < placed.length; index += EXTRACT_BATCH) {
    requests += 1;
    try {
      const batch = await readSummaries(
        placed.slice(index, index + EXTRACT_BATCH).map((item) => item.title),
        signal,
      );
      for (const [title, summary] of batch) summaries.set(title, summary);
    } catch (error) {
      if (signal?.aborted) throw error;
      failures.push(`wikipedia:summaries ${(error as Error).message}`);
    }
  }

  const events: ParsedHistoricalEvent[] = [];
  for (const { title, placement } of placed) {
    const url = wikipediaArticleUrl(title);
    const summary = summaries.get(title);
    if (!url || !summary || summary.extract.length < 24 || !isLikelyHistoricalSourceUrl(url)) {
      continue;
    }
    events.push({
      title,
      description: summary.extract,
      eventDate: eventDateIso(placement.begin),
      windowFit: placement.fit,
      dayOffset: placement.dayOffset,
      sourceName: "Wikipedia",
      url,
      citations: [],
      searchQuery: CATEGORY_DISCOVERY,
      ...(summary.imageUrl ? { imageUrl: summary.imageUrl } : {}),
    });
  }
  diagnostics.kept = events.length;

  return { events, requests, diagnostics, failures };
}
