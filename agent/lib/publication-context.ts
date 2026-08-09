const PUBLICATION_TIME_ZONE = "Australia/Perth";
const FIRST_EDITION_DATE = Date.UTC(2026, 7, 9);
const DAY_MS = 24 * 60 * 60 * 1_000;
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

export function buildPublicationContext(now = new Date()) {
  const { year, month, day } = datePartsInPerth(now);
  const editionDate = [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
  const issueNumber = Math.max(
    1,
    Math.floor((Date.UTC(year, month - 1, day) - FIRST_EDITION_DATE) / DAY_MS) + 1,
  );

  return {
    editionDate,
    issueNumber,
    timeZone: PUBLICATION_TIME_ZONE,
    publicationTime: "07.00 WITA",
    ...buildEditorialWindow(now),
    expectedArticleCount: 8,
  } as const;
}
