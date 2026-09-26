/**
 * Contemporary reporting for the Kemarin sheet from the New York Times archive.
 *
 * Wikimedia can say what happened; only a paper from that week can say what was
 * known. The Archive API returns every item the Times published in a month, so the
 * sheet reads the issues dated from three days before the printed day up to the
 * printed day itself — the copy a desk that morning could have had on the wire —
 * and keeps the foreign desk's reports and the national desk's reports of harm.
 *
 * The key travels only in the request URL, and no error carries that URL.
 */
import { formatIsoDate, parseIsoDate } from "../../shared/calendar";
import { isLikelyHistoricalSourceUrl } from "../../shared/edition";
import { IMPACT_KEYWORDS } from "./historical-evidence";
import type { ParsedHistoricalEvent } from "./historical-news";
import { classifyWindowFit, dayDelta, DAY_MS, type DateParts } from "./historical-window";
import { record, text } from "./wikimedia";

export const NYT_DISCOVERY = "nyt:archive";

/** Issues dated this many days before the printed day are read, and the printed day itself. */
export const NYT_LOOKBACK_DAYS = 3;

/** Enough to fill a sheet several times over without burying the Wikimedia candidates. */
export const MAX_NYT_REPORTS = 40;

const NON_REPORT_MATERIAL =
  /^(?:correction|letter|editorial|op-ed|obituary|obit|review|biography|paid death notice|summary|list|schedule|question|chronology|caption|recipe|text)/iu;

/**
 * The foreign desk carries the world the sheet reports, so every one of its reports
 * is read. The national desk is read only for reports of harm, and the other desks —
 * the city, business, sport and culture pages — not at all.
 */
const FOREIGN_DESK = /\b(?:foreign|world)\b/iu;
const NATIONAL_DESK = /\b(?:national|u\.s\.)(?:\s|$)/iu;

/** Words the evidence scorer does not need but a wire report of unrest often turns on. */
const UNREST_KEYWORDS =
  /\b(?:loot|troops|soldiers|rebels?|guerrillas?|militia|clash|gunfire|gunmen|violence|curfew|kidnap|captive|shelling|fighting|unrest|uprising|martial law|crackdown|executed|arrested)/iu;

export function reportsHarm(value: string): boolean {
  return IMPACT_KEYWORDS.test(value) || UNREST_KEYWORDS.test(value);
}

export const NYT_ARCHIVE_STATUSES = ["ok", "no-key", "failed"] as const;

export interface NytArchiveDiagnostics {
  status: (typeof NYT_ARCHIVE_STATUSES)[number];
  scanned: number;
  kept: number;
}

export interface NytArchiveResult {
  events: ParsedHistoricalEvent[];
  requests: number;
  diagnostics: NytArchiveDiagnostics;
  failures: string[];
}

interface ArchiveDoc {
  url: string;
  headline: string;
  summary: string;
  published: DateParts;
  frontPage: boolean;
  foreignDesk: boolean;
  harm: boolean;
  words: number;
}

function cleanSummary(value: string): string {
  return value
    .replace(/^\s*LEAD:\s*/iu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 600);
}

function readDoc(raw: unknown): ArchiveDoc | null {
  const doc = record(raw);
  if (!doc) return null;
  const documentType = text(doc.document_type);
  if (documentType && documentType !== "article") return null;
  const material = text(doc.type_of_material) ?? "";
  if (NON_REPORT_MATERIAL.test(material)) return null;
  const desk = `${text(doc.news_desk) ?? ""} ${text(doc.section_name) ?? ""}`;
  const foreignDesk = FOREIGN_DESK.test(desk);
  if (!foreignDesk && !NATIONAL_DESK.test(desk)) return null;

  const url = text(doc.web_url);
  const headlineRecord = record(doc.headline);
  const headline = text(headlineRecord?.main) ?? text(headlineRecord?.print_headline);
  const summary = cleanSummary(
    text(doc.abstract) ?? text(doc.lead_paragraph) ?? text(doc.snippet) ?? "",
  );
  const published = parseIsoDate((text(doc.pub_date) ?? "").slice(0, 10));
  if (!url || !headline || !published || summary.length < 24) return null;
  if (!isLikelyHistoricalSourceUrl(url)) return null;
  const cleanHeadline = headline.replace(/\s+/gu, " ").trim();
  const harm = reportsHarm(`${cleanHeadline} ${summary}`);
  if (!foreignDesk && !harm) return null;

  return {
    url,
    headline: cleanHeadline,
    summary,
    published,
    frontPage: String(doc.print_page ?? "").trim() === "1",
    foreignDesk,
    harm,
    words: typeof doc.word_count === "number" ? doc.word_count : 0,
  };
}

/** Reports of harm first, then the front page, then the foreign desk, then the latest issue. */
function byProminence(edition: DateParts) {
  return (left: ArchiveDoc, right: ArchiveDoc): number =>
    Number(right.harm) - Number(left.harm) ||
    Number(right.frontPage) - Number(left.frontPage) ||
    Number(right.foreignDesk) - Number(left.foreignDesk) ||
    dayDelta(edition, right.published) - dayDelta(edition, left.published) ||
    right.words - left.words;
}

export function parseNytArchive(
  payloads: unknown[],
  editionDate: string,
): { events: ParsedHistoricalEvent[]; scanned: number } {
  const edition = parseIsoDate(editionDate);
  if (!edition) return { events: [], scanned: 0 };
  const seen = new Set<string>();
  const docs: ArchiveDoc[] = [];
  let scanned = 0;

  for (const payload of payloads) {
    const list = record(record(payload)?.response)?.docs;
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      scanned += 1;
      const doc = readDoc(raw);
      if (!doc || seen.has(doc.url)) continue;
      const delta = dayDelta(edition, doc.published);
      if (delta > 0 || delta < -NYT_LOOKBACK_DAYS) continue;
      seen.add(doc.url);
      docs.push(doc);
    }
  }

  const events: ParsedHistoricalEvent[] = [];
  for (const doc of docs.sort(byProminence(edition)).slice(0, MAX_NYT_REPORTS)) {
    const fit = classifyWindowFit(edition, doc.published);
    if (!fit) continue;
    events.push({
      title: doc.headline,
      description: doc.summary,
      eventDate: `${formatIsoDate(doc.published)}T12:00:00.000Z`,
      windowFit: fit.fit,
      dayOffset: fit.dayOffset,
      sourceName: "The New York Times",
      url: doc.url,
      citations: [],
      searchQuery: NYT_DISCOVERY,
    });
  }
  return { events, scanned };
}

/** The months whose issues cover the lookback, oldest first. */
export function archiveMonths(editionDate: string): { year: number; month: number }[] {
  const edition = parseIsoDate(editionDate);
  if (!edition) return [];
  const start = new Date(
    Date.UTC(edition.year, edition.month - 1, edition.day) - NYT_LOOKBACK_DAYS * DAY_MS,
  );
  const first = { year: start.getUTCFullYear(), month: start.getUTCMonth() + 1 };
  return first.year === edition.year && first.month === edition.month
    ? [first]
    : [first, { year: edition.year, month: edition.month }];
}

async function fetchArchiveMonth(
  year: number,
  month: number,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<{ payload: unknown; requests: number }> {
  const url = new URL(`https://api.nytimes.com/svc/archive/v1/${year}/${month}.json`);
  url.searchParams.set("api-key", apiKey);
  let requests = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    requests += 1;
    const response = await fetch(url, { headers: { accept: "application/json" }, signal });
    if (response.status === 429 && attempt === 0) {
      // The archive allows five calls a minute; one short wait covers a neighbour's burst.
      await new Promise((resolve) => setTimeout(resolve, 12_000));
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { payload: await response.json(), requests };
  }
  throw new Error("HTTP 429");
}

export async function collectNytReports(
  editionDate: string,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<NytArchiveResult> {
  if (!apiKey) {
    return {
      events: [],
      requests: 0,
      diagnostics: { status: "no-key", scanned: 0, kept: 0 },
      failures: ["nyt:archive NYT_API_KEY is not configured"],
    };
  }
  const payloads: unknown[] = [];
  const failures: string[] = [];
  let requests = 0;
  for (const { year, month } of archiveMonths(editionDate)) {
    try {
      const result = await fetchArchiveMonth(year, month, apiKey, signal);
      requests += result.requests;
      payloads.push(result.payload);
    } catch (error) {
      if (signal?.aborted) throw error;
      requests += 1;
      failures.push(
        `nyt:archive ${year}-${String(month).padStart(2, "0")} ${(error as Error).message}`,
      );
    }
  }
  const { events, scanned } = parseNytArchive(payloads, editionDate);
  return {
    events,
    requests,
    diagnostics: {
      status: payloads.length ? "ok" : "failed",
      scanned,
      kept: events.length,
    },
    failures,
  };
}
