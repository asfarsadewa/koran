import {
  DEFAULT_EDITION_KIND,
  formatIsoDate,
  historicalDateFromPublication,
  KEMARIN_OFFSET_YEARS,
  subtractCalendarYears,
  type EditionKind,
} from "../../shared/calendar";

const PUBLICATION_TIME_ZONE = "Australia/Perth";
const FIRST_EDITION_DATE = Date.UTC(2026, 7, 9);
const DAY_MS = 24 * 60 * 60 * 1_000;
const PERTH_UTC_OFFSET_HOURS = 8;
export const EDITORIAL_WINDOW_HOURS = 36;
export const EDITORIAL_WINDOW_MS = EDITORIAL_WINDOW_HOURS * 60 * 60 * 1_000;

export interface EditorialWindow {
  searchWindowStart: string;
  searchWindowEnd: string;
}

export function buildEditorialWindow(now: Date): EditorialWindow {
  return {
    searchWindowStart: new Date(now.getTime() - EDITORIAL_WINDOW_MS).toISOString(),
    searchWindowEnd: now.toISOString(),
  };
}

function datePartsInPerth(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PUBLICATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type)?.value;
    if (!part) throw new Error(`Missing ${type} while calculating publication date`);
    return Number(part);
  };

  return { year: value("year"), month: value("month"), day: value("day") };
}

function perthMidnightUtc(parts: { year: number; month: number; day: number }): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, -PERTH_UTC_OFFSET_HOURS));
}

export function shiftPerthInstantByYears(now: Date, years: number): Date {
  const today = datePartsInPerth(now);
  const historical = subtractCalendarYears(today, years);
  const elapsed = now.getTime() - perthMidnightUtc(today).getTime();
  return new Date(perthMidnightUtc(historical).getTime() + elapsed);
}

export function buildPublicationContext(now = new Date(), kind: EditionKind = DEFAULT_EDITION_KIND) {
  const today = datePartsInPerth(now);
  const publicationDate = formatIsoDate(today);
  const editionDate =
    kind === "kemarin" ? historicalDateFromPublication(publicationDate) : publicationDate;
  const issueNumber = Math.max(
    1,
    Math.floor((Date.UTC(today.year, today.month - 1, today.day) - FIRST_EDITION_DATE) / DAY_MS) + 1,
  );
  const windowNow = kind === "kemarin" ? shiftPerthInstantByYears(now, KEMARIN_OFFSET_YEARS) : now;

  return {
    kind,
    editionDate,
    publicationDate,
    issueNumber,
    timeZone: PUBLICATION_TIME_ZONE,
    publicationTime: "07.00 WITA",
    offsetYears: kind === "kemarin" ? KEMARIN_OFFSET_YEARS : 0,
    ...buildEditorialWindow(windowNow),
    expectedArticleCount: 8,
  } as const;
}

export function buildKemarinPublicationContext(now = new Date()) {
  return buildPublicationContext(now, "kemarin");
}
