export const INDONESIAN_LOCALE = "id";
export const CHINESE_LOCALE = "zh-Hans";

/**
 * A Kemarin sheet prints as many stories as its historical morning supports, so
 * completeness is measured against this edition's own article count rather than a
 * fixed eight. Every printed rank must be translated; one missing rank would drop a
 * story from the page when the reader switches language.
 */
export function hasChineseEdition(edition) {
  const chinese = edition?.translations?.zhHans;
  if (!chinese || typeof chinese.mastheadDek !== "string") return false;
  const printed = Array.isArray(edition?.articles) ? edition.articles.length : 0;
  if (printed === 0) return false;
  if (!Array.isArray(chinese.articles) || chinese.articles.length !== printed) return false;
  const ranks = new Set(chinese.articles.map((article) => article?.rank));
  return (
    ranks.size === printed &&
    [...ranks].every((rank) => Number.isInteger(rank) && rank >= 1 && rank <= printed)
  );
}

export function mixLanguageText(source, target, progress) {
  if (progress <= 0) return source;
  if (progress >= 1) return target;
  const targetEnd = Math.floor(target.length * progress);
  const sourceStart = Math.floor(source.length * progress);
  return `${target.slice(0, targetEnd)}${source.slice(sourceStart)}`;
}

export function formatEditionDate(value, locale) {
  const date = new Date(`${value}T00:00:00+08:00`);
  return new Intl.DateTimeFormat(locale === CHINESE_LOCALE ? "zh-CN" : "id-ID", {
    timeZone: "Australia/Perth",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatSourceDate(value, locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === CHINESE_LOCALE ? "zh-CN" : "id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
