/**
 * Discovery for the Kemarin sheet.
 *
 * Wikimedia is read for recall — what may have mattered on the printed day — and
 * every candidate leaves here dated, deduplicated and carrying the provenance the
 * evidence layer attached to it. Nothing is collected that a paper printed that
 * morning could not have known.
 */
import { z } from "zod";

import { isLikelyHistoricalSourceUrl } from "../../shared/edition";
import { formatIsoDate, parseIsoDate } from "../../shared/calendar";
import {
  conflictPressureFor,
  markCoverage,
  namesPressureCountry,
  type ConflictPressure,
} from "./gdelt-conflict";
import {
  buildEvidence,
  extractCitations,
  hasEditionTimeEvidence,
  historicalEvidenceSchema,
  independentPublishers,
  scoreCandidate,
  type HistoricalEvidence,
  type ParsedCitation,
} from "./historical-evidence";
import {
  classifyWindowFit,
  dayDelta,
  HISTORICAL_WINDOW_FITS,
  RECENT_LOOKBACK_DAYS,
  type DateParts,
  type HistoricalWindowFit,
} from "./historical-window";
import { EDITORIAL_WINDOW_MS } from "./publication-context";

// The vocabulary a reader of the ledger needs, re-exported so consumers of the
// collector do not have to know which module each half lives in.
export { HISTORICAL_WINDOW_FITS, type HistoricalWindowFit } from "./historical-window";
export {
  EVIDENCE_AVAILABILITY,
  EVIDENCE_SOURCE_TYPES,
  EVIDENCE_TIMINGS,
  historicalEvidenceSchema,
  type HistoricalEvidence,
} from "./historical-evidence";

const parseableTimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Editorial window timestamps must be parseable ISO dates",
);

export const historicalWindowSchema = z
  .object({
    searchWindowStart: parseableTimestampSchema,
    searchWindowEnd: parseableTimestampSchema,
    editionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    publicationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  })
  .superRefine((window, context) => {
    const start = Date.parse(window.searchWindowStart);
    const end = Date.parse(window.searchWindowEnd);
    if (end - start !== EDITORIAL_WINDOW_MS) {
      context.addIssue({
        code: "custom",
        path: ["searchWindowEnd"],
        message: "Editorial window must span exactly 36 hours",
      });
    }
  });

export const historicalCandidateSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  description: z.string(),
  sourceName: z.string(),
  domain: z.string(),
  publishedAt: z.string(),
  windowFit: z.enum(HISTORICAL_WINDOW_FITS),
  dayOffset: z.number().int(),
  searchQuery: z.string(),
  discoveredBy: z.array(z.string()),
  imageUrl: z.string().url().optional(),
  evidence: z.array(historicalEvidenceSchema),
  hasContemporaryEvidence: z.boolean(),
  hasEditionTimeEvidence: z.boolean(),
  hasIndependentCorroboration: z.boolean(),
  evidenceScore: z.number(),
});

export const historicalDiagnosticsSchema = z.object({
  discovery: z.record(z.string(), z.number().int()),
  deduplicated: z.number().int().nonnegative(),
  excludedFuture: z.number().int().nonnegative(),
  excludedTooOld: z.number().int().nonnegative(),
  excludedOtherYear: z.number().int().nonnegative(),
  windowFit: z.object({
    exact: z.number().int().nonnegative(),
    adjacent: z.number().int().nonnegative(),
    ongoing: z.number().int().nonnegative(),
    recent: z.number().int().nonnegative(),
  }),
  withContemporaryEvidence: z.number().int().nonnegative(),
  withEditionTimeEvidence: z.number().int().nonnegative(),
  withIndependentCorroboration: z.number().int().nonnegative(),
  encyclopediaOnly: z.number().int().nonnegative(),
  conflictPressure: z.array(
    z.object({
      code: z.string(),
      country: z.string(),
      events: z.number().int(),
      ratio: z.number(),
      named: z.boolean(),
    }),
  ),
  fallbacks: z.array(z.string()),
  failures: z.array(z.string()),
});

export const historicalCandidateResultSchema = z.object({
  searchesRun: z.number().int(),
  searchWindowStart: parseableTimestampSchema,
  searchWindowEnd: parseableTimestampSchema,
  editionDate: z.string(),
  publicationDate: z.string(),
  excludedOutsideWindow: z.number().int().nonnegative(),
  excludedWithoutTimestamp: z.number().int().nonnegative(),
  diagnostics: historicalDiagnosticsSchema,
  results: z.array(historicalCandidateSchema),
});

export type HistoricalWindow = z.infer<typeof historicalWindowSchema>;
export type HistoricalCandidate = z.infer<typeof historicalCandidateSchema>;
export type HistoricalCandidateResult = z.infer<typeof historicalCandidateResultSchema>;

export const WIKIMEDIA_USER_AGENT =
  "JuaraMerdeka/0.1 (https://koran.r3ptil.com; kemarin-historical-desk)";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WIKI_LINK = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/gu;
const FILE_OR_CATEGORY = /^(?:File|Image|Category|Special|Wikipedia|Template|Help):/iu;

type JsonRecord = Record<string, unknown>;

let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function cleanWikiText(value: string, maxLength = 600): string {
  return value
    .replace(/\{\{[^}]*\}\}/gu, " ")
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/giu, " ")
    .replace(/<ref\b[^>]*\/>/giu, " ")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/gu, "$1")
    .replace(/\[\[([^\]]+)\]\]/gu, "$1")
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/gu, "$1")
    .replace(/'{2,}/gu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&nbsp;/gu, " ")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

export function wikipediaArticleUrl(title: string): string | null {
  const trimmed = title.replace(/_/gu, " ").trim();
  if (!trimmed || FILE_OR_CATEGORY.test(trimmed)) return null;
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(trimmed).replace(/%20/gu, "_")}`;
}

export function extractWikiTitles(markup: string): string[] {
  const titles: string[] = [];
  for (const match of markup.matchAll(WIKI_LINK)) {
    const raw = (match[1] ?? "").replace(/_/gu, " ").trim();
    if (!raw || FILE_OR_CATEGORY.test(raw) || MONTH_NAMES.includes(raw as (typeof MONTH_NAMES)[number])) {
      continue;
    }
    if (/^\d{4}$/u.test(raw)) continue;
    if (/^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d/u.test(raw)) {
      continue;
    }
    titles.push(raw);
  }
  return [...new Set(titles)];
}

/* -------------------------------------------------------------------------- */
/* Wikitext and feed parsing                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Running tally of the candidates each parser drops, so the ledger handed to the
 * curating model reports what was actually filtered instead of a constant zero.
 */
export interface HistoricalSkipLedger {
  outsideWindow: number;
  withoutTimestamp: number;
  future: number;
  tooOld: number;
  otherYear: number;
}

export function skipLedger(): HistoricalSkipLedger {
  return { outsideWindow: 0, withoutTimestamp: 0, future: 0, tooOld: 0, otherYear: 0 };
}

export interface ParsedHistoricalEvent {
  title: string;
  description: string;
  eventDate: string;
  windowFit: HistoricalWindowFit;
  dayOffset: number;
  sourceName: string;
  url: string;
  citations: ParsedCitation[];
  searchQuery: string;
  imageUrl?: string;
}

function eventDateIso(year: number, month: number, day: number): string {
  return `${formatIsoDate({ year, month, day })}T12:00:00.000Z`;
}

function recordRejection(ledger: HistoricalSkipLedger, dayOffset: number): void {
  ledger.outsideWindow += 1;
  if (dayOffset > 0) ledger.future += 1;
  else ledger.tooOld += 1;
}

/**
 * A calendar-day page and an on-this-day feed both answer with every year that ever
 * used that date, so most of what they offer is discarded on the year alone. Counted
 * apart from the day-distance rejections, which are the ones that say something about
 * how thin the printed day itself was.
 */
function recordOtherYear(ledger: HistoricalSkipLedger): void {
  ledger.outsideWindow += 1;
  ledger.otherYear += 1;
}

const MONTH_NAME_GROUP =
  "January|February|March|April|May|June|July|August|September|October|November|December";

const MONTH_BULLET = new RegExp(
  `^\\*\\s*\\[\\[((?:${MONTH_NAME_GROUP})\\s+\\d{1,2})\\]\\]` +
    `(?:\\s*[–-]\\s*\\[\\[((?:${MONTH_NAME_GROUP})\\s+\\d{1,2})(?:\\|[^\\]]+)?\\]\\])?` +
    `\\s*[–—:-]?\\s*(.+)$`,
  "gmu",
);

export function parseYearMonthWikitext(
  wikitext: string,
  year: number,
  editionDate: string,
  ledger: HistoricalSkipLedger = skipLedger(),
): ParsedHistoricalEvent[] {
  const editionParts = parseIsoDate(editionDate);
  if (!editionParts) return [];
  const events: ParsedHistoricalEvent[] = [];

  for (const match of wikitext.matchAll(MONTH_BULLET)) {
    const startParts = parseMonthDayLabel(match[1] ?? "", year);
    if (!startParts) {
      ledger.withoutTimestamp += 1;
      continue;
    }
    // `August 30 – September 2` closes in a later month, and `December 30 – January 2`
    // in a later year. Reading the end day against the start month turned both into
    // ranges that ran backwards, and a range that runs backwards can never straddle
    // the printed day — which is the one thing an end date is here to establish.
    const endLabel = match[2];
    const endInStartYear = endLabel ? parseMonthDayLabel(endLabel, year) : null;
    const endParts =
      endInStartYear && endInStartYear.month < startParts.month
        ? parseMonthDayLabel(endLabel ?? "", year + 1)
        : endInStartYear;
    const fit = classifyWindowFit(editionParts, startParts, endParts);
    if (!fit) {
      recordRejection(ledger, dayDelta(editionParts, startParts));
      continue;
    }

    const titles = extractWikiTitles(match[0]);
    const primaryTitle = titles[0];
    const url = primaryTitle
      ? wikipediaArticleUrl(primaryTitle)
      : `https://en.wikipedia.org/wiki/${year}`;
    if (!url || !isLikelyHistoricalSourceUrl(url)) continue;

    const description = cleanWikiText(match[3] ?? "");
    if (description.length < 24) continue;

    events.push({
      title: cleanWikiText(primaryTitle ?? description, 300),
      description,
      eventDate: eventDateIso(startParts.year, startParts.month, startParts.day),
      windowFit: fit.fit,
      dayOffset: fit.dayOffset,
      sourceName: "Wikipedia",
      url,
      citations: extractCitations(match[0]).filter((citation) => citation.url !== url),
      searchQuery: "wikipedia:year-chronology",
    });
  }

  return events;
}

function parseMonthDayLabel(label: string, year: number): DateParts | null {
  const match = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})$/u.exec(
    label.trim(),
  );
  if (!match) return null;
  const month = MONTH_NAMES.indexOf(match[1] as (typeof MONTH_NAMES)[number]) + 1;
  const day = Number(match[2]);
  return parseIsoDate(formatIsoDate({ year, month, day }));
}

const DAY_PAGE_BULLET = /^\*\s*\[\[(\d{4})\]\]\s*[–—:-]\s*(.+)$/gmu;

export function parseOnThisDayPageWikitext(
  wikitext: string,
  editionDate: string,
  ledger: HistoricalSkipLedger = skipLedger(),
): ParsedHistoricalEvent[] {
  const editionParts = parseIsoDate(editionDate);
  if (!editionParts) return [];
  const events: ParsedHistoricalEvent[] = [];

  for (const match of wikitext.matchAll(DAY_PAGE_BULLET)) {
    const year = Number(match[1]);
    if (year !== editionParts.year) {
      recordOtherYear(ledger);
      continue;
    }
    const eventParts = { year, month: editionParts.month, day: editionParts.day };
    const fit = classifyWindowFit(editionParts, eventParts);
    if (!fit) {
      recordRejection(ledger, dayDelta(editionParts, eventParts));
      continue;
    }
    const titles = extractWikiTitles(match[0]);
    const primaryTitle = titles[0];
    const url = primaryTitle ? wikipediaArticleUrl(primaryTitle) : null;
    if (!url) continue;
    const description = cleanWikiText(match[2] ?? "");
    if (description.length < 24) continue;
    events.push({
      title: cleanWikiText(primaryTitle ?? description, 300),
      description,
      eventDate: eventDateIso(year, editionParts.month, editionParts.day),
      windowFit: fit.fit,
      dayOffset: fit.dayOffset,
      sourceName: "Wikipedia",
      url,
      citations: extractCitations(match[0]).filter((citation) => citation.url !== url),
      searchQuery: "wikipedia:day-page",
    });
  }

  return events;
}

/**
 * The feed names its list after the kind that was asked for: `onthisday/events`
 * answers with `events`, `onthisday/selected` with `selected`. Reading only the
 * first key quietly discarded every curated entry.
 */
const FEED_LIST_KEYS = ["events", "selected"] as const;

export function onThisDayEntries(payload: unknown): unknown[] | null {
  const root = record(payload);
  if (!root) return null;
  for (const key of FEED_LIST_KEYS) {
    const list = root[key];
    if (Array.isArray(list)) return list;
  }
  return null;
}

export function parseOnThisDayFeed(
  payload: unknown,
  editionDate: string,
  searchQuery: string,
  ledger: HistoricalSkipLedger = skipLedger(),
): ParsedHistoricalEvent[] {
  const editionParts = parseIsoDate(editionDate);
  if (!editionParts) return [];
  const items = onThisDayEntries(payload) ?? [];
  const events: ParsedHistoricalEvent[] = [];

  for (const item of items) {
    const entry = record(item);
    const year = typeof entry?.year === "number" ? entry.year : Number(entry?.year);
    if (!Number.isFinite(year)) {
      ledger.withoutTimestamp += 1;
      continue;
    }
    if (year !== editionParts.year) {
      recordOtherYear(ledger);
      continue;
    }
    const pages = Array.isArray(entry?.pages) ? entry.pages : [];
    const page = pages.map(record).find((candidate) => candidate && text(candidate.title));
    const title = text(page?.titles && record(page.titles)?.normalized) ?? text(page?.title);
    // The entry text says what happened that day; the page extract only says what
    // the linked article is about, which reads as an encyclopedia, not a report.
    const extract = text(entry?.text) ?? text(page?.extract);
    const pageUrl =
      text(record(record(page?.content_urls)?.desktop)?.page) ??
      (title ? wikipediaArticleUrl(title) : null);
    if (!title || !extract || !pageUrl || extract.length < 24) continue;
    if (!isLikelyHistoricalSourceUrl(pageUrl)) continue;

    const eventParts = { year, month: editionParts.month, day: editionParts.day };
    const fit = classifyWindowFit(editionParts, eventParts);
    if (!fit) {
      recordRejection(ledger, dayDelta(editionParts, eventParts));
      continue;
    }

    const thumbnail = text(record(page?.thumbnail)?.source);
    events.push({
      title: cleanWikiText(title, 300),
      description: cleanWikiText(extract),
      eventDate: eventDateIso(year, editionParts.month, editionParts.day),
      windowFit: fit.fit,
      dayOffset: fit.dayOffset,
      sourceName: "Wikipedia",
      url: pageUrl,
      citations: [],
      searchQuery,
      ...(thumbnail && thumbnail.startsWith("https:") ? { imageUrl: thumbnail } : {}),
    });
  }

  return events;
}

/* -------------------------------------------------------------------------- */
/* Wikimedia transport                                                        */
/* -------------------------------------------------------------------------- */

async function waitForRateWindow(): Promise<void> {
  const remaining = 1_100 - (Date.now() - lastRequestAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  lastRequestAt = Date.now();
}

function queued<T>(operation: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(async () => {
    await waitForRateWindow();
    return operation();
  });
  requestQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function wikipediaGet(url: URL, signal?: AbortSignal): Promise<unknown> {
  return queued(async () => {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": WIKIMEDIA_USER_AGENT,
        },
        signal,
      });
      if (response.status !== 429) break;
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter)
        ? Math.max(retryAfter * 1_000, 1_500)
        : 1_500 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      lastRequestAt = Date.now();
    }
    if (!response) throw new Error("Wikimedia returned no response");
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Wikimedia request failed with HTTP ${response.status}`);
    }
    return response.json();
  });
}

function wikiApiUrl(params: Record<string, string>): URL {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params }).toString();
  return url;
}

/**
 * Reads the month section of a year chronology. The table of contents costs one
 * request and the section body another, so the caller is told how many actually
 * went out rather than assuming both always do.
 */
export async function fetchYearMonthWikitext(
  year: number,
  monthName: string,
  signal?: AbortSignal,
): Promise<{ wikitext: string; requests: number }> {
  const toc = record(await wikipediaGet(wikiApiUrl({ action: "parse", page: String(year), prop: "sections" }), signal));
  const parse = record(toc?.parse);
  const sections = Array.isArray(parse?.sections) ? parse.sections : [];
  const monthSection = sections
    .map(record)
    .find((section) => text(section?.line) === monthName);
  const index = text(monthSection?.index);
  if (!index) return { wikitext: "", requests: 1 };
  const body = record(
    await wikipediaGet(
      wikiApiUrl({ action: "parse", page: String(year), prop: "wikitext", section: index }),
      signal,
    ),
  );
  return { wikitext: text(record(body?.parse)?.wikitext) ?? "", requests: 2 };
}

export async function fetchDayPageWikitext(
  monthName: string,
  day: number,
  signal?: AbortSignal,
): Promise<string> {
  const page = `${monthName}_${day}`;
  const body = record(
    await wikipediaGet(wikiApiUrl({ action: "parse", page, prop: "wikitext" }), signal),
  );
  return text(record(body?.parse)?.wikitext) ?? "";
}

/**
 * The Wikimedia API Portal is migrating, so the feed is read through the portal
 * host first and the equivalent per-wiki REST route second. Both answer with the
 * same OnThisDay profile, and neither is allowed to take the whole sweep down —
 * the chronology and day-page parsers stand on their own.
 */
export const ON_THIS_DAY_ENDPOINTS = [
  {
    name: "api.wikimedia.org",
    url: (month: string, day: string, kind: string) =>
      new URL(`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/${kind}/${month}/${day}`),
  },
  {
    name: "en.wikipedia.org/api/rest_v1",
    url: (month: string, day: string, kind: string) =>
      new URL(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/${kind}/${month}/${day}`),
  },
] as const;

export interface FeedFetchResult {
  payload: unknown;
  requests: number;
  fallback?: string;
  failure?: string;
}

export async function fetchOnThisDayFeed(
  month: number,
  day: number,
  kind: "events" | "selected",
  signal?: AbortSignal,
): Promise<FeedFetchResult> {
  const monthPart = String(month).padStart(2, "0");
  const dayPart = String(day).padStart(2, "0");
  let requests = 0;
  let lastFailure = "";

  for (const [index, endpoint] of ON_THIS_DAY_ENDPOINTS.entries()) {
    requests += 1;
    try {
      const payload = await wikipediaGet(endpoint.url(monthPart, dayPart, kind), signal);
      if (onThisDayEntries(payload)) {
        return {
          payload,
          requests,
          ...(index > 0 ? { fallback: `${kind}:${endpoint.name}` } : {}),
        };
      }
      lastFailure = `${kind}:${endpoint.name} returned no entries`;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastFailure = `${kind}:${endpoint.name} ${(error as Error).message}`;
    }
  }

  return { payload: null, requests, failure: lastFailure };
}

/* -------------------------------------------------------------------------- */
/* Collection                                                                 */
/* -------------------------------------------------------------------------- */

type EvidenceSummary = Pick<
  HistoricalCandidate,
  | "hasContemporaryEvidence"
  | "hasEditionTimeEvidence"
  | "hasIndependentCorroboration"
  | "evidenceScore"
>;

function summariseEvidence(
  evidence: HistoricalEvidence[],
  event: Pick<HistoricalCandidate, "title" | "description" | "discoveredBy">,
  pressure: ConflictPressure[],
): EvidenceSummary {
  const independent = independentPublishers(evidence);
  return {
    hasContemporaryEvidence: evidence.some((item) => item.timing === "contemporary"),
    hasEditionTimeEvidence: hasEditionTimeEvidence(evidence),
    hasIndependentCorroboration: independent.size > 0,
    evidenceScore: scoreCandidate({
      evidence,
      independentPublishers: independent.size,
      discoveredBy: event.discoveredBy,
      title: event.title,
      description: event.description,
      namesPressureCountry: namesPressureCountry(
        `${event.title} ${event.description}`,
        pressure,
      ),
    }),
  };
}

function toCandidate(
  event: ParsedHistoricalEvent,
  pressure: ConflictPressure[],
  editionDate: string,
): HistoricalCandidate | null {
  if (!isLikelyHistoricalSourceUrl(event.url)) return null;
  let domain: string;
  try {
    domain = new URL(event.url).hostname.replace(/^www\./u, "");
  } catch {
    return null;
  }

  const evidence = [
    buildEvidence({ url: event.url }, event.eventDate, editionDate),
    ...event.citations
      .slice(0, 6)
      .map((citation) => buildEvidence(citation, event.eventDate, editionDate)),
  ];
  const discoveredBy = [event.searchQuery];

  return historicalCandidateSchema.parse({
    title: event.title,
    url: event.url,
    description: event.description,
    sourceName: event.sourceName,
    domain,
    publishedAt: event.eventDate,
    windowFit: event.windowFit,
    dayOffset: event.dayOffset,
    searchQuery: event.searchQuery,
    discoveredBy,
    evidence,
    ...summariseEvidence(evidence, { ...event, discoveredBy }, pressure),
    ...(event.imageUrl ? { imageUrl: event.imageUrl } : {}),
  });
}

const FIT_RANK: Record<HistoricalWindowFit, number> = {
  exact: 0,
  adjacent: 1,
  ongoing: 2,
  recent: 3,
};

/** One event reached by two surfaces is one candidate carrying both sets of evidence. */
function mergeCandidates(
  existing: HistoricalCandidate,
  incoming: HistoricalCandidate,
  pressure: ConflictPressure[],
): HistoricalCandidate {
  const preferred =
    FIT_RANK[incoming.windowFit] < FIT_RANK[existing.windowFit] ? incoming : existing;
  const evidence = [...existing.evidence];
  for (const item of incoming.evidence) {
    if (!evidence.some((known) => known.url === item.url)) evidence.push(item);
  }
  const discoveredBy = [...new Set([...existing.discoveredBy, ...incoming.discoveredBy])];
  const imageUrl = existing.imageUrl ?? incoming.imageUrl;

  return {
    ...preferred,
    discoveredBy,
    evidence,
    ...(imageUrl ? { imageUrl } : {}),
    ...summariseEvidence(evidence, { ...preferred, discoveredBy }, pressure),
  };
}

export async function collectHistoricalCandidates(
  rawWindow: HistoricalWindow,
  signal?: AbortSignal,
): Promise<HistoricalCandidateResult> {
  const window = historicalWindowSchema.parse(rawWindow);
  const editionParts = parseIsoDate(window.editionDate);
  if (!editionParts) throw new Error("Kemarin edition date is invalid");
  const monthName = MONTH_NAMES[editionParts.month - 1];
  if (!monthName) throw new Error("Kemarin edition month is invalid");

  let searchesRun = 0;
  const ledger = skipLedger();
  const parsed: ParsedHistoricalEvent[] = [];
  const fallbacks: string[] = [];
  const failures: string[] = [];

  // Read before the sweep so candidates naming a country under unusual conflict
  // can be scored as they are built. An unindexed year is a maintenance fact, not
  // a quiet absence of violence.
  const indexed = conflictPressureFor(window.editionDate);
  if (!indexed) {
    failures.push(`gdelt:${window.editionDate.slice(0, 4)} is not in the conflict index`);
  }
  const pressure = indexed ?? [];

  const yearSection = await fetchYearMonthWikitext(editionParts.year, monthName, signal);
  searchesRun += yearSection.requests;
  parsed.push(
    ...parseYearMonthWikitext(yearSection.wikitext, editionParts.year, window.editionDate, ledger),
  );

  // An edition printed early in the month would otherwise carry nothing from before
  // it at all, because everything inside the lookback began the month before.
  if (editionParts.day <= RECENT_LOOKBACK_DAYS) {
    const previous =
      editionParts.month === 1
        ? { year: editionParts.year - 1, month: 12 }
        : { year: editionParts.year, month: editionParts.month - 1 };
    const previousName = MONTH_NAMES[previous.month - 1];
    if (previousName) {
      const previousSection = await fetchYearMonthWikitext(previous.year, previousName, signal);
      searchesRun += previousSection.requests;
      parsed.push(
        ...parseYearMonthWikitext(
          previousSection.wikitext,
          previous.year,
          window.editionDate,
          ledger,
        ),
      );
    }
  }

  const dayText = await fetchDayPageWikitext(monthName, editionParts.day, signal);
  searchesRun += 1;
  parsed.push(...parseOnThisDayPageWikitext(dayText, window.editionDate, ledger));

  for (const kind of ["events", "selected"] as const) {
    const feed = await fetchOnThisDayFeed(editionParts.month, editionParts.day, kind, signal);
    searchesRun += feed.requests;
    if (feed.fallback) fallbacks.push(feed.fallback);
    if (feed.failure) failures.push(feed.failure);
    parsed.push(
      ...parseOnThisDayFeed(feed.payload, window.editionDate, `wikimedia:${kind}`, ledger),
    );
  }

  const discovery: Record<string, number> = {};
  const byUrl = new Map<string, HistoricalCandidate>();

  for (const event of parsed) {
    discovery[event.searchQuery] = (discovery[event.searchQuery] ?? 0) + 1;
    if (!Number.isFinite(Date.parse(event.eventDate))) {
      ledger.withoutTimestamp += 1;
      continue;
    }
    const candidate = toCandidate(event, pressure, window.editionDate);
    if (!candidate) continue;
    const existing = byUrl.get(candidate.url);
    byUrl.set(
      candidate.url,
      existing ? mergeCandidates(existing, candidate, pressure) : candidate,
    );
  }

  // Date fit first, because the sheet exists to print that day; evidence strength
  // then separates candidates that belong on it equally well.
  const ranked = [...byUrl.values()].sort(
    (left, right) =>
      FIT_RANK[left.windowFit] - FIT_RANK[right.windowFit] ||
      right.evidenceScore - left.evidenceScore ||
      left.title.localeCompare(right.title),
  );

  return historicalCandidateResultSchema.parse({
    searchesRun,
    searchWindowStart: window.searchWindowStart,
    searchWindowEnd: window.searchWindowEnd,
    editionDate: window.editionDate,
    publicationDate: window.publicationDate,
    excludedOutsideWindow: ledger.outsideWindow,
    excludedWithoutTimestamp: ledger.withoutTimestamp,
    diagnostics: {
      discovery,
      deduplicated: parsed.length - ranked.length,
      excludedFuture: ledger.future,
      excludedTooOld: ledger.tooOld,
      excludedOtherYear: ledger.otherYear,
      windowFit: {
        exact: ranked.filter((item) => item.windowFit === "exact").length,
        adjacent: ranked.filter((item) => item.windowFit === "adjacent").length,
        ongoing: ranked.filter((item) => item.windowFit === "ongoing").length,
        recent: ranked.filter((item) => item.windowFit === "recent").length,
      },
      withContemporaryEvidence: ranked.filter((item) => item.hasContemporaryEvidence).length,
      withEditionTimeEvidence: ranked.filter((item) => item.hasEditionTimeEvidence).length,
      withIndependentCorroboration: ranked.filter((item) => item.hasIndependentCorroboration).length,
      encyclopediaOnly: ranked.filter(
        (item) => !item.evidence.some((source) => source.sourceType !== "encyclopedia"),
      ).length,
      conflictPressure: markCoverage(
        pressure,
        ranked.map((item) => `${item.title} ${item.description}`),
      ),
      fallbacks,
      failures,
    },
    results: ranked,
  });
}
