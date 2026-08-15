/**
 * Provenance for the Kemarin sheet.
 *
 * Wikimedia tells the desk what may have mattered on a given day. It does not by
 * itself establish what was known and reported at the time, so every URL reaching
 * the ledger is labelled with who published it and whether it reads as reporting
 * from that week or as history written later.
 */
import { z } from "zod";

import { isLikelyHistoricalSourceUrl } from "../../shared/edition";
import { formatIsoDate, parseIsoDate } from "../../shared/calendar";
import { DAY_MS } from "./historical-window";

/** A source dated within this many days after the event still reads as reporting, not history. */
const CONTEMPORARY_AFTER_DAYS = 45;

/** …and this far before it, which absorbs wire copy filed early and date-line slip. */
const CONTEMPORARY_BEFORE_DAYS = 7;

export const EVIDENCE_SOURCE_TYPES = [
  "encyclopedia",
  "news",
  "institution",
  "archive",
  "other",
] as const;

/**
 * `contemporary` is only claimed for a source carrying a full date close to the
 * event. A citation offering nothing but a year stays `unknown` rather than being
 * counted as proof of what was known at the time.
 */
export const EVIDENCE_TIMINGS = ["contemporary", "retrospective", "unknown"] as const;

/**
 * Whether the desk producing the printed edition could have held this source, which
 * is a different question from whether the source reports the event as it happened.
 * A dispatch filed the day after the sheet went to press is contemporary reporting
 * and still not something its editor had.
 */
export const EVIDENCE_AVAILABILITY = ["available", "unavailable", "unknown"] as const;

/**
 * Where the citation was found. `event-line` means a Wikipedia editor attached it to
 * the chronology line for that day, which pins it to the event. `article` means it
 * was taken off the topic's own reference list and kept only because its date falls
 * in the event's weeks — near enough to be worth reading, not proof it is about this
 * incident rather than another one in the same war.
 */
export const EVIDENCE_ATTACHMENTS = ["event-line", "article"] as const;

export const historicalEvidenceSchema = z.object({
  url: z.string().url(),
  publisher: z.string(),
  sourceType: z.enum(EVIDENCE_SOURCE_TYPES),
  timing: z.enum(EVIDENCE_TIMINGS),
  availableByEdition: z.enum(EVIDENCE_AVAILABILITY),
  attachedTo: z.enum(EVIDENCE_ATTACHMENTS),
  publishedAt: z.string().optional(),
});

export type HistoricalEvidence = z.infer<typeof historicalEvidenceSchema>;

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

/* -------------------------------------------------------------------------- */
/* Citation extraction                                                        */
/* -------------------------------------------------------------------------- */

export interface ParsedCitation {
  url: string;
  /** `YYYY`, `YYYY-MM` or `YYYY-MM-DD` — whatever precision the citation offered. */
  publishedAt?: string;
}

const CITE_TEMPLATE = /\{\{([^{}]*)\}\}/gu;
// Anchored on the parameter separator so `access-date` and `archive-url` cannot be
// read as the citation's own date or the publisher's own link.
const TEMPLATE_URL = /(?:^|\|)\s*url\s*=\s*(https:\/\/[^\s|}\]]+)/iu;
const TEMPLATE_DATE = /(?:^|\|)\s*(?:publication-date|date)\s*=\s*([^|}\n]+)/iu;
const TEMPLATE_YEAR = /(?:^|\|)\s*year\s*=\s*(\d{4})/iu;
const ANY_CITE_URL = /(?:^|[|\s])url\s*=\s*(https:\/\/[^\s|}\]]+)/giu;
const ARCHIVED_TARGET = /\/(https?:\/\/.+)$/u;
const URL_PATH_DATE = /\/(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?(?=\/|[-_.]|$)/u;

function monthIndex(name: string): number {
  return MONTH_NAMES.findIndex((month) => month.toLowerCase() === name.toLowerCase()) + 1;
}

/** Follows a Wayback wrapper to the page it captured, so dates and publishers come from the original. */
export function unwrapArchiveUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname.replace(/^www\./u, "") !== "web.archive.org") return value;
    const archived = ARCHIVED_TARGET.exec(url.pathname)?.[1];
    return archived ? new URL(archived).toString() : value;
  } catch {
    return value;
  }
}

export function parseCitationDate(value: string): string | undefined {
  const raw = value.replace(/\[\[|\]\]/gu, "").replace(/&nbsp;/gu, " ").trim();

  const iso = /^\d{4}-\d{2}-\d{2}$/u.test(raw);
  if (iso) return parseIsoDate(raw) ? raw : undefined;

  const dayFirst = /^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/u.exec(raw);
  if (dayFirst) {
    const month = monthIndex(dayFirst[2] ?? "");
    if (month < 1) return undefined;
    const candidate = formatIsoDate({
      year: Number(dayFirst[3]),
      month,
      day: Number(dayFirst[1]),
    });
    return parseIsoDate(candidate) ? candidate : undefined;
  }

  const monthFirst = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/u.exec(raw);
  if (monthFirst) {
    const month = monthIndex(monthFirst[1] ?? "");
    if (month < 1) return undefined;
    const candidate = formatIsoDate({
      year: Number(monthFirst[3]),
      month,
      day: Number(monthFirst[2]),
    });
    return parseIsoDate(candidate) ? candidate : undefined;
  }

  const monthOnly = /^([A-Za-z]+)\.?\s+(\d{4})$/u.exec(raw);
  const namedMonth = monthOnly ? monthIndex(monthOnly[1] ?? "") : 0;
  // `c. 1991` also matches this shape, so an unrecognised word falls through to
  // the bare-year reading rather than discarding the year with it.
  if (monthOnly && namedMonth > 0) {
    return `${monthOnly[2]}-${String(namedMonth).padStart(2, "0")}`;
  }

  const yearOnly = /^(?:c\.\s*)?(\d{4})$/u.exec(raw);
  return yearOnly ? yearOnly[1] : undefined;
}

/** Many news URLs carry their own publication date; it beats no date at all. */
export function dateFromUrlPath(value: string): string | undefined {
  try {
    const match = URL_PATH_DATE.exec(new URL(unwrapArchiveUrl(value)).pathname);
    if (!match) return undefined;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year < 1800 || year > 2200 || month < 1 || month > 12) return undefined;
    if (!match[3]) return `${match[1]}-${String(month).padStart(2, "0")}`;
    const candidate = formatIsoDate({ year, month, day: Number(match[3]) });
    return parseIsoDate(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pulls the citations out of a chronology bullet together with whatever date the
 * editor recorded. The date is the point: a URL alone cannot say whether it is a
 * dispatch from that week or a history written twenty years later.
 */
export function extractCitations(markup: string): ParsedCitation[] {
  const byUrl = new Map<string, ParsedCitation>();
  const trimUrl = (value: string): string => value.replace(/[.,;]+$/u, "");

  for (const template of markup.matchAll(CITE_TEMPLATE)) {
    const body = template[1] ?? "";
    const url = TEMPLATE_URL.exec(body)?.[1];
    if (!url) continue;
    const trimmed = trimUrl(url);
    if (!isLikelyHistoricalSourceUrl(trimmed)) continue;
    const stated = TEMPLATE_DATE.exec(body)?.[1];
    const publishedAt =
      (stated ? parseCitationDate(stated) : undefined) ??
      TEMPLATE_YEAR.exec(body)?.[1] ??
      dateFromUrlPath(trimmed);
    byUrl.set(trimmed, { url: trimmed, ...(publishedAt ? { publishedAt } : {}) });
  }

  for (const match of markup.matchAll(ANY_CITE_URL)) {
    const url = trimUrl(match[1] ?? "");
    if (!url || byUrl.has(url) || !isLikelyHistoricalSourceUrl(url)) continue;
    const publishedAt = dateFromUrlPath(url);
    byUrl.set(url, { url, ...(publishedAt ? { publishedAt } : {}) });
  }

  return [...byUrl.values()];
}

/* -------------------------------------------------------------------------- */
/* Publisher and source classification                                        */
/* -------------------------------------------------------------------------- */

const ENCYCLOPEDIA_HOSTS =
  /(?:^|\.)(?:wikipedia\.org|wikisource\.org|wikidata\.org|britannica\.com)$/iu;
const ARCHIVE_HOSTS = /(?:^|\.)(?:archive\.org|archive\.ph|archive\.today)$/iu;
const INSTITUTION_HOSTS =
  /(?:^|\.)(?:un\.org|who\.int|unhcr\.org|unicef\.org|reliefweb\.int|icrc\.org|ifrc\.org|redcross\.org|amnesty\.org|hrw\.org|usgs\.gov|noaa\.gov|nasa\.gov)$/iu;
const INSTITUTION_SUFFIX = /(?:^|\.)(?:gov|mil|int|edu)(?:\.[a-z]{2,3})?$/iu;
const INSTITUTION_LOCAL = /(?:^|\.)(?:go\.(?:id|jp|kr|th)|gc\.ca|govt\.nz)$/iu;
const SECOND_LEVEL_SUFFIX = /^(?:co|com|org|net|gov|edu|ac|go|gc|govt|or|ne)$/iu;

/** Groups `www.nytimes.com` and `archive.nytimes.com` so syndication is not read as two sources. */
export function registrableDomain(host: string): string {
  const labels = host.replace(/^www\./iu, "").toLowerCase().split(".");
  if (labels.length <= 2) return labels.join(".");
  const [secondLast, last] = labels.slice(-2);
  if (last && last.length === 2 && secondLast && SECOND_LEVEL_SUFFIX.test(secondLast)) {
    return labels.slice(-3).join(".");
  }
  return labels.slice(-2).join(".");
}

export function classifySourceType(url: string): HistoricalEvidence["sourceType"] {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./iu, "");
  } catch {
    return "other";
  }
  if (ENCYCLOPEDIA_HOSTS.test(host)) return "encyclopedia";
  if (ARCHIVE_HOSTS.test(host)) return "archive";
  if (INSTITUTION_HOSTS.test(host) || INSTITUTION_SUFFIX.test(host) || INSTITUTION_LOCAL.test(host)) {
    return "institution";
  }
  return "news";
}

function dateRange(value: string): { start: number; end: number } | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (day) {
    const time = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    return { start: time, end: time };
  }
  const month = /^(\d{4})-(\d{2})$/u.exec(value);
  if (month) {
    const year = Number(month[1]);
    const index = Number(month[2]) - 1;
    return { start: Date.UTC(year, index, 1), end: Date.UTC(year, index + 1, 0) };
  }
  const year = /^(\d{4})$/u.exec(value);
  if (year) {
    return { start: Date.UTC(Number(year[1]), 0, 1), end: Date.UTC(Number(year[1]), 11, 31) };
  }
  return null;
}

export function classifyTiming(
  publishedAt: string | undefined,
  eventDate: string,
): HistoricalEvidence["timing"] {
  const eventParts = parseIsoDate(eventDate.slice(0, 10));
  if (!publishedAt || !eventParts) return "unknown";
  const range = dateRange(publishedAt);
  if (!range) return "unknown";
  const event = Date.UTC(eventParts.year, eventParts.month - 1, eventParts.day);
  if (range.start > event + CONTEMPORARY_AFTER_DAYS * DAY_MS) return "retrospective";
  // Only a full date earns the contemporary label; a bare year is merely not disproven.
  if (range.start !== range.end) return "unknown";
  return range.start >= event - CONTEMPORARY_BEFORE_DAYS * DAY_MS ? "contemporary" : "unknown";
}

/**
 * Compares the source against the printed day rather than against the event. The
 * comparison is made on the whole span a partial date covers, so `1991-09` is
 * settled as unavailable to a sheet printed in August while a bare `1991` straddles
 * the cutoff and stays unknown.
 */
export function classifyAvailability(
  publishedAt: string | undefined,
  editionDate: string,
): HistoricalEvidence["availableByEdition"] {
  const editionParts = parseIsoDate(editionDate.slice(0, 10));
  if (!publishedAt || !editionParts) return "unknown";
  const range = dateRange(publishedAt);
  if (!range) return "unknown";
  const cutoff = Date.UTC(editionParts.year, editionParts.month - 1, editionParts.day);
  if (range.end <= cutoff) return "available";
  if (range.start > cutoff) return "unavailable";
  return "unknown";
}

export function buildEvidence(
  citation: ParsedCitation,
  eventDate: string,
  editionDate: string,
  attachedTo: HistoricalEvidence["attachedTo"] = "event-line",
): HistoricalEvidence {
  const sourceType = classifySourceType(citation.url);
  const original = unwrapArchiveUrl(citation.url);
  let publisher: string;
  try {
    publisher = registrableDomain(new URL(original).hostname);
  } catch {
    publisher = "unknown";
  }
  const publishedAt = citation.publishedAt ?? dateFromUrlPath(citation.url);
  // An encyclopedia article is written about the event, never from inside it, and
  // no desk of that morning could have held it whatever date the citation carries.
  const encyclopedia = sourceType === "encyclopedia";
  return {
    url: citation.url,
    publisher,
    sourceType,
    timing: encyclopedia ? "retrospective" : classifyTiming(publishedAt, eventDate),
    availableByEdition: encyclopedia ? "unavailable" : classifyAvailability(publishedAt, editionDate),
    attachedTo,
    ...(publishedAt ? { publishedAt } : {}),
  };
}

/**
 * Reporting from the event's own week that the printing desk could also have held.
 * This is the strongest support a reconstructed story can carry, and the only kind
 * that may introduce a fact the sheet prints as its own.
 */
export function hasEditionTimeEvidence(evidence: HistoricalEvidence[]): boolean {
  return evidence.some(
    (item) => item.timing === "contemporary" && item.availableByEdition === "available",
  );
}

/** Publishers behind the evidence that are neither the encyclopedia nor its own host. */
export function independentPublishers(evidence: HistoricalEvidence[]): Set<string> {
  const primary = evidence[0]?.publisher;
  return new Set(
    evidence
      .filter((item) => item.sourceType !== "encyclopedia" && item.publisher !== primary)
      .map((item) => item.publisher),
  );
}

/* -------------------------------------------------------------------------- */
/* Ledger scoring                                                             */
/* -------------------------------------------------------------------------- */

const IMPACT_KEYWORDS =
  /\b(?:war|fighting|battle|siege|shell|bomb|massacr|killed|deaths?|casualt|wounded|famine|starvation|refugee|displac|evacuat|earthquake|flood|cyclone|hurricane|typhoon|drought|epidemic|cholera|outbreak|disease|crash|derail|explosion|blaze|coup|riot|protest|repression|torture|detain|hostage|blockade|sanction|collapse|genocide|expel|expuls)/iu;

export interface ScoreInput {
  evidence: HistoricalEvidence[];
  independentPublishers: number;
  discoveredBy: string[];
  title: string;
  description: string;
  /** The candidate names a country under unusual conflict on the printed day. */
  namesPressureCountry?: boolean;
}

/**
 * A transparent weighted sum of how well a candidate is supported. It deliberately
 * says nothing about the date — the ledger is ordered by window fit first, so this
 * score only separates candidates that belong equally well on the printed day. It
 * never removes a candidate and never picks the edition; Eve still does that.
 */
export function scoreCandidate(input: ScoreInput): number {
  const hasContemporary = input.evidence.some((item) => item.timing === "contemporary");
  const hasRetrospective = input.evidence.some((item) => item.timing === "retrospective");
  let score = 0;
  if (hasContemporary) score += 25;
  // Reporting the desk could actually have held is worth more than reporting that
  // merely belongs to the same week, so the two bonuses stack rather than replace.
  if (hasEditionTimeEvidence(input.evidence)) score += 10;
  // Where the citation was attached deliberately does not move the score. It is
  // recorded on each source and left for the desk to weigh, because no published
  // edition has yet shown what the discount should be.
  if (input.independentPublishers >= 1) score += 15;
  if (input.independentPublishers >= 2) score += 10;
  if (input.evidence.some((item) => item.sourceType === "institution")) score += 10;
  if (input.discoveredBy.length > 1) score += 6;
  if (IMPACT_KEYWORDS.test(`${input.title} ${input.description}`)) score += 6;
  if (input.namesPressureCountry) score += 8;
  if (!hasContemporary && hasRetrospective) score -= 10;
  if (input.independentPublishers === 0) score -= 8;
  return score;
}
