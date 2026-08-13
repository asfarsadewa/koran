import { z } from "zod";

import { isLikelyHistoricalSourceUrl } from "../../shared/edition";
import { formatIsoDate, parseIsoDate } from "../../shared/calendar";
import { EDITORIAL_WINDOW_MS } from "./publication-context";

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
  windowFit: z.enum(["exact", "adjacent", "month"]),
  searchQuery: z.string(),
  imageUrl: z.string().url().optional(),
  corroboratingUrls: z.array(z.string().url()),
});

export const historicalCandidateResultSchema = z.object({
  searchesRun: z.number().int(),
  searchWindowStart: parseableTimestampSchema,
  searchWindowEnd: parseableTimestampSchema,
  editionDate: z.string(),
  publicationDate: z.string(),
  excludedOutsideWindow: z.number().int().nonnegative(),
  excludedWithoutTimestamp: z.number().int().nonnegative(),
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
const CITE_URL = /\burl\s*=\s*(https:\/\/[^\s|}]+)/giu;
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

export function extractCiteUrls(markup: string): string[] {
  const urls: string[] = [];
  for (const match of markup.matchAll(CITE_URL)) {
    const url = (match[1] ?? "").replace(/[.,;]+$/u, "");
    if (isLikelyHistoricalSourceUrl(url)) urls.push(url);
  }
  return [...new Set(urls)];
}

export interface ParsedHistoricalEvent {
  title: string;
  description: string;
  eventDate: string;
  windowFit: HistoricalCandidate["windowFit"];
  sourceName: string;
  url: string;
  corroboratingUrls: string[];
  searchQuery: string;
  imageUrl?: string;
}

function eventDateIso(year: number, month: number, day: number): string {
  return `${formatIsoDate({ year, month, day })}T12:00:00.000Z`;
}

function classifyWindowFit(
  eventTime: number,
  windowStart: number,
  windowEnd: number,
  editionParts: { year: number; month: number; day: number },
  eventParts: { year: number; month: number; day: number },
): HistoricalCandidate["windowFit"] | null {
  const dayDelta =
    (Date.UTC(eventParts.year, eventParts.month - 1, eventParts.day) -
      Date.UTC(editionParts.year, editionParts.month - 1, editionParts.day)) /
    86_400_000;
  if (dayDelta === 0 || dayDelta === -1 || (eventTime >= windowStart && eventTime <= windowEnd)) {
    return "exact";
  }
  if (Math.abs(dayDelta) <= 2) return "adjacent";
  if (eventParts.year === editionParts.year && eventParts.month === editionParts.month) {
    return "month";
  }
  return null;
}

const MONTH_BULLET =
  /^\*\s*\[\[((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})\]\](?:\s*[–-]\s*\[\[(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\|[^\]]+)?\]\])?\s*[–—:-]?\s*(.+)$/gmu;

export function parseYearMonthWikitext(
  wikitext: string,
  year: number,
  editionDate: string,
  windowStart: number,
  windowEnd: number,
): ParsedHistoricalEvent[] {
  const editionParts = parseIsoDate(editionDate);
  if (!editionParts) return [];
  const events: ParsedHistoricalEvent[] = [];

  for (const match of wikitext.matchAll(MONTH_BULLET)) {
    const startLabel = match[1] ?? "";
    const rangeEndDay = match[2];
    const body = match[3] ?? "";
    const startParts = parseMonthDayLabel(startLabel, year);
    if (!startParts) continue;
    const eventTime = Date.parse(eventDateIso(startParts.year, startParts.month, startParts.day));
    const fit = classifyWindowFit(eventTime, windowStart, windowEnd, editionParts, startParts);
    if (!fit) continue;

    const titles = extractWikiTitles(match[0]);
    const primaryTitle = titles[0];
    const url = primaryTitle
      ? wikipediaArticleUrl(primaryTitle)
      : `https://en.wikipedia.org/wiki/${year}`;
    if (!url || !isLikelyHistoricalSourceUrl(url)) continue;

    const description = cleanWikiText(body);
    if (description.length < 24) continue;

    events.push({
      title: cleanWikiText(primaryTitle ?? description, 300),
      description,
      eventDate: eventDateIso(startParts.year, startParts.month, startParts.day),
      windowFit: rangeEndDay && fit === "month" ? "month" : fit,
      sourceName: "Wikipedia",
      url,
      corroboratingUrls: extractCiteUrls(match[0]).filter((candidate) => candidate !== url),
      searchQuery: `wikipedia:${year}-month`,
    });
  }

  return events;
}

function parseMonthDayLabel(
  label: string,
  year: number,
): { year: number; month: number; day: number } | null {
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
  windowStart: number,
  windowEnd: number,
): ParsedHistoricalEvent[] {
  const editionParts = parseIsoDate(editionDate);
  if (!editionParts) return [];
  const events: ParsedHistoricalEvent[] = [];

  for (const match of wikitext.matchAll(DAY_PAGE_BULLET)) {
    const year = Number(match[1]);
    const body = match[2] ?? "";
    if (year !== editionParts.year) continue;
    const eventTime = Date.parse(eventDateIso(year, editionParts.month, editionParts.day));
    const fit = classifyWindowFit(
      eventTime,
      windowStart,
      windowEnd,
      editionParts,
      { year, month: editionParts.month, day: editionParts.day },
    );
    if (!fit) continue;
    const titles = extractWikiTitles(match[0]);
    const primaryTitle = titles[0];
    const url = primaryTitle ? wikipediaArticleUrl(primaryTitle) : null;
    if (!url) continue;
    const description = cleanWikiText(body);
    if (description.length < 24) continue;
    events.push({
      title: cleanWikiText(primaryTitle ?? description, 300),
      description,
      eventDate: eventDateIso(year, editionParts.month, editionParts.day),
      windowFit: fit,
      sourceName: "Wikipedia",
      url,
      corroboratingUrls: extractCiteUrls(match[0]).filter((candidate) => candidate !== url),
      searchQuery: "wikipedia:on-this-day-page",
    });
  }

  return events;
}

export function parseOnThisDayFeed(
  payload: unknown,
  editionDate: string,
  windowStart: number,
  windowEnd: number,
  searchQuery: string,
): ParsedHistoricalEvent[] {
  const editionParts = parseIsoDate(editionDate);
  if (!editionParts) return [];
  const root = record(payload);
  const items = Array.isArray(root?.events) ? root.events : [];
  const events: ParsedHistoricalEvent[] = [];

  for (const item of items) {
    const entry = record(item);
    const year = typeof entry?.year === "number" ? entry.year : Number(entry?.year);
    if (year !== editionParts.year) continue;
    const pages = Array.isArray(entry?.pages) ? entry.pages : [];
    const page = pages.map(record).find((candidate) => candidate && text(candidate.title));
    const title = text(page?.titles && record(page.titles)?.normalized) ?? text(page?.title);
    const extract = text(page?.extract) ?? text(entry?.text);
    const pageUrl =
      text(record(record(page?.content_urls)?.desktop)?.page) ??
      (title ? wikipediaArticleUrl(title) : null);
    if (!title || !extract || !pageUrl || extract.length < 24) continue;
    if (!isLikelyHistoricalSourceUrl(pageUrl)) continue;

    const eventTime = Date.parse(eventDateIso(year, editionParts.month, editionParts.day));
    const fit = classifyWindowFit(
      eventTime,
      windowStart,
      windowEnd,
      editionParts,
      { year, month: editionParts.month, day: editionParts.day },
    );
    if (!fit) continue;

    const thumbnail = text(record(page?.thumbnail)?.source);
    events.push({
      title: cleanWikiText(title, 300),
      description: cleanWikiText(extract),
      eventDate: eventDateIso(year, editionParts.month, editionParts.day),
      windowFit: fit,
      sourceName: "Wikipedia",
      url: pageUrl,
      corroboratingUrls: [],
      searchQuery,
      ...(thumbnail && thumbnail.startsWith("https:") ? { imageUrl: thumbnail } : {}),
    });
  }

  return events;
}

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

export async function fetchYearMonthWikitext(
  year: number,
  monthName: string,
  signal?: AbortSignal,
): Promise<string> {
  const toc = record(await wikipediaGet(wikiApiUrl({ action: "parse", page: String(year), prop: "sections" }), signal));
  const parse = record(toc?.parse);
  const sections = Array.isArray(parse?.sections) ? parse.sections : [];
  const monthSection = sections
    .map(record)
    .find((section) => text(section?.line) === monthName);
  const index = text(monthSection?.index);
  if (!index) return "";
  const body = record(
    await wikipediaGet(
      wikiApiUrl({ action: "parse", page: String(year), prop: "wikitext", section: index }),
      signal,
    ),
  );
  return text(record(body?.parse)?.wikitext) ?? "";
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

function onThisDayUrl(month: number, day: number, kind: "events" | "selected"): URL {
  return new URL(
    `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/${kind}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
  );
}

function toCandidate(
  event: ParsedHistoricalEvent & { imageUrl?: string },
): HistoricalCandidate | null {
  if (!isLikelyHistoricalSourceUrl(event.url)) return null;
  let domain: string;
  try {
    domain = new URL(event.url).hostname.replace(/^www\./u, "");
  } catch {
    return null;
  }
  return historicalCandidateSchema.parse({
    title: event.title,
    url: event.url,
    description: event.description,
    sourceName: event.sourceName,
    domain,
    publishedAt: event.eventDate,
    windowFit: event.windowFit,
    searchQuery: event.searchQuery,
    corroboratingUrls: event.corroboratingUrls.slice(0, 4),
    ...(event.imageUrl ? { imageUrl: event.imageUrl } : {}),
  });
}

function betterFit(
  left: HistoricalCandidate["windowFit"],
  right: HistoricalCandidate["windowFit"],
): boolean {
  const rank = { exact: 0, adjacent: 1, month: 2 };
  return rank[left] < rank[right];
}

export async function collectHistoricalCandidates(
  rawWindow: HistoricalWindow,
  signal?: AbortSignal,
): Promise<HistoricalCandidateResult> {
  const window = historicalWindowSchema.parse(rawWindow);
  const editionParts = parseIsoDate(window.editionDate);
  if (!editionParts) throw new Error("Kemarin edition date is invalid");
  const windowStart = Date.parse(window.searchWindowStart);
  const windowEnd = Date.parse(window.searchWindowEnd);
  const monthName = MONTH_NAMES[editionParts.month - 1];
  if (!monthName) throw new Error("Kemarin edition month is invalid");

  let searchesRun = 0;
  const parsed: Array<ParsedHistoricalEvent & { imageUrl?: string }> = [];

  const yearText = await fetchYearMonthWikitext(editionParts.year, monthName, signal);
  searchesRun += 2;
  parsed.push(
    ...parseYearMonthWikitext(yearText, editionParts.year, window.editionDate, windowStart, windowEnd),
  );

  const dayText = await fetchDayPageWikitext(monthName, editionParts.day, signal);
  searchesRun += 1;
  parsed.push(...parseOnThisDayPageWikitext(dayText, window.editionDate, windowStart, windowEnd));

  for (const kind of ["events", "selected"] as const) {
    const feed = await wikipediaGet(onThisDayUrl(editionParts.month, editionParts.day, kind), signal);
    searchesRun += 1;
    parsed.push(
      ...parseOnThisDayFeed(feed, window.editionDate, windowStart, windowEnd, `wikimedia:${kind}`),
    );
  }

  const byUrl = new Map<string, HistoricalCandidate>();
  let excludedOutsideWindow = 0;
  let excludedWithoutTimestamp = 0;

  for (const event of parsed) {
    const publishedAt = Date.parse(event.eventDate);
    if (!Number.isFinite(publishedAt)) {
      excludedWithoutTimestamp += 1;
      continue;
    }
    const candidate = toCandidate(event);
    if (!candidate) continue;
    const existing = byUrl.get(candidate.url);
    if (!existing || betterFit(candidate.windowFit, existing.windowFit)) {
      byUrl.set(candidate.url, candidate);
    }
  }

  const ranked = [...byUrl.values()].sort((left, right) => {
    const rank = { exact: 0, adjacent: 1, month: 2 };
    return rank[left.windowFit] - rank[right.windowFit] || left.title.localeCompare(right.title);
  });

  return historicalCandidateResultSchema.parse({
    searchesRun,
    searchWindowStart: window.searchWindowStart,
    searchWindowEnd: window.searchWindowEnd,
    editionDate: window.editionDate,
    publicationDate: window.publicationDate,
    excludedOutsideWindow,
    excludedWithoutTimestamp,
    results: ranked,
  });
}
