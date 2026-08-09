export const INDONESIAN_LOCALE = "id";
export const CHINESE_LOCALE = "zh-Hans";

export function hasChineseEdition(edition) {
  const chinese = edition?.translations?.zhHans;
  if (!chinese || typeof chinese.mastheadDek !== "string") return false;
  if (!Array.isArray(chinese.articles) || chinese.articles.length !== 8) return false;
  const ranks = new Set(chinese.articles.map((article) => article?.rank));
  return ranks.size === 8 && [...ranks].every((rank) => Number.isInteger(rank) && rank >= 1 && rank <= 8);
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
