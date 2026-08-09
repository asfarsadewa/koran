export const INDONESIAN_LOCALE: "id";
export const CHINESE_LOCALE: "zh-Hans";

export function hasChineseEdition(edition: unknown): boolean;
export function mixLanguageText(source: string, target: string, progress: number): string;
export function formatEditionDate(value: string, locale: string): string;
export function formatSourceDate(value: string, locale: string): string;
