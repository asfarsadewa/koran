export const EDITION_KINDS = ["hari_ini", "kemarin"] as const;
export type EditionKind = (typeof EDITION_KINDS)[number];
export const DEFAULT_EDITION_KIND: EditionKind = "hari_ini";
export const KEMARIN_OFFSET_YEARS = 35;
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function isEditionKind(value: string | null | undefined): value is EditionKind {
  return value === "hari_ini" || value === "kemarin";
}

export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > lastDay) return null;
  return { year, month, day };
}

export function formatIsoDate(parts: { year: number; month: number; day: number }): string {
  return [
    String(parts.year),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

export function subtractCalendarYears(
  parts: { year: number; month: number; day: number },
  years: number,
): { year: number; month: number; day: number } {
  const year = parts.year - years;
  const lastDay = new Date(Date.UTC(year, parts.month, 0)).getUTCDate();
  return { year, month: parts.month, day: Math.min(parts.day, lastDay) };
}

export function historicalDateFromPublication(publicationDate: string): string {
  const parts = parseIsoDate(publicationDate);
  if (!parts) throw new Error(`Invalid publication date: ${publicationDate}`);
  return formatIsoDate(subtractCalendarYears(parts, KEMARIN_OFFSET_YEARS));
}

export function editionIdFor(kind: EditionKind, publicationDate: string): string {
  return kind === "kemarin" ? `kemarin-${publicationDate}` : publicationDate;
}

export function resolvedPublicationDate(
  kind: EditionKind,
  editionDate: string,
  publicationDate?: string,
): string {
  if (kind !== "kemarin") return publicationDate ?? editionDate;
  // This value becomes the edition id and the uniqueness key, so an absent
  // publication date must fail loudly rather than store an empty one.
  if (!publicationDate) {
    throw new Error("Kemarin editions require the Perth publication date");
  }
  return publicationDate;
}
