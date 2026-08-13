import { z } from "zod";

import {
  DEFAULT_EDITION_KIND,
  EDITION_KINDS,
  historicalDateFromPublication,
  ISO_DATE_PATTERN,
  type EditionKind,
} from "./calendar";

export {
  DEFAULT_EDITION_KIND,
  EDITION_KINDS,
  editionIdFor,
  formatIsoDate,
  historicalDateFromPublication,
  ISO_DATE_PATTERN,
  isEditionKind,
  KEMARIN_OFFSET_YEARS,
  parseIsoDate,
  resolvedPublicationDate,
  subtractCalendarYears,
  type EditionKind,
} from "./calendar";

export const SECTION_KEYS = [
  "conflict",
  "disaster",
  "humanitarian",
  "rights",
  "health",
  "climate",
  "economy",
] as const;

const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "URL must use HTTPS");

export function isLikelyDirectArticleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return false;
    const last = decodeURIComponent(segments.at(-1) ?? "").toLowerCase();
    if (
      /^(archive|category|home|latest|news|rubric-[a-z0-9-]+|topic|world)$/u.test(last)
    ) {
      return false;
    }
    return last.length >= 14 || /\d{5,}/u.test(last) || /\.html?$/u.test(last);
  } catch {
    return false;
  }
}

const WIKIPEDIA_HOST = /(?:^|\.)wikipedia\.org$/iu;
const WIKIPEDIA_FORBIDDEN_TITLE =
  /^(?:Special:|Wikipedia:|File:|Help:|Template:|Talk:|Portal:|Category:|User:|Draft:|Main_Page$)/iu;

export function isLikelyHistoricalSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.replace(/^www\./u, "");
    const segments = url.pathname.split("/").filter(Boolean);

    if (WIKIPEDIA_HOST.test(host)) {
      if (segments[0] !== "wiki" || segments.length < 2) return false;
      const title = decodeURIComponent(segments[1] ?? "");
      return title.length >= 3 && !WIKIPEDIA_FORBIDDEN_TITLE.test(title) && !/^\d{4}$/u.test(title);
    }

    if (isLikelyDirectArticleUrl(value)) return true;

    if (host.endsWith("britannica.com")) {
      return segments.length >= 2 && segments[0] === "topic";
    }

    if (host === "web.archive.org") {
      const archived = url.pathname.match(/\/https?:\/(.+)$/u)?.[1];
      return Boolean(archived && isLikelyHistoricalSourceUrl(`https://${archived}`));
    }

    return false;
  } catch {
    return false;
  }
}

function sourceUrlAllowed(kind: EditionKind, value: string): boolean {
  return kind === "kemarin" ? isLikelyHistoricalSourceUrl(value) : isLikelyDirectArticleUrl(value);
}

const chineseCopy = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) => /\p{Script=Han}/u.test(value), "Chinese copy must contain Han characters");

export const articleSchema = z.object({
  rank: z.number().int().min(1).max(8),
  section: z.enum(SECTION_KEYS),
  headline: z.string().trim().min(20).max(140),
  dek: z.string().trim().min(70).max(420),
  dateline: z.string().trim().min(2).max(80),
  sourceName: z.string().trim().min(2).max(100),
  sourceUrl: httpsUrl,
  sourcePublishedAt: z.string().trim().min(10).max(40),
  impact: z.string().trim().min(50).max(280),
  imageUrl: httpsUrl.optional(),
});

export const chineseArticleSchema = z.object({
  rank: z.number().int().min(1).max(8),
  headline: chineseCopy(8, 70),
  dek: chineseCopy(30, 260),
  dateline: chineseCopy(2, 40),
  impact: chineseCopy(20, 180),
});

const chineseEditionSchema = z
  .object({
    mastheadDek: chineseCopy(20, 180),
    articles: z.array(chineseArticleSchema).length(8),
  })
  .superRefine((edition, context) => {
    const ranks = new Set(edition.articles.map((article) => article.rank));
    if (ranks.size !== 8 || [...ranks].some((rank) => rank < 1 || rank > 8)) {
      context.addIssue({
        code: "custom",
        path: ["articles"],
        message: "Chinese articles must use each rank from 1 through 8 exactly once",
      });
    }
  });

export const editionInputSchema = z
  .object({
    kind: z.enum(EDITION_KINDS).default(DEFAULT_EDITION_KIND),
    editionDate: z.string().regex(ISO_DATE_PATTERN),
    publicationDate: z.string().regex(ISO_DATE_PATTERN).optional(),
    issueNumber: z.number().int().positive().max(999_999),
    mastheadDek: z.string().trim().min(40).max(260),
    articles: z.array(articleSchema).length(8),
    translations: z.object({
      zhHans: chineseEditionSchema,
    }),
  })
  .superRefine((edition, context) => {
    const ranks = new Set(edition.articles.map((article) => article.rank));
    if (ranks.size !== 8 || [...ranks].some((rank) => rank < 1 || rank > 8)) {
      context.addIssue({
        code: "custom",
        path: ["articles"],
        message: "Articles must use each rank from 1 through 8 exactly once",
      });
    }

    const urls = edition.articles.map((article) => article.sourceUrl);
    if (new Set(urls).size !== urls.length) {
      context.addIssue({
        code: "custom",
        path: ["articles"],
        message: "Every article must point to a distinct source URL",
      });
    }

    edition.articles.forEach((article, index) => {
      if (!sourceUrlAllowed(edition.kind, article.sourceUrl)) {
        context.addIssue({
          code: "custom",
          path: ["articles", index, "sourceUrl"],
          message:
            edition.kind === "kemarin"
              ? "Source URL must point to a direct article or a dated encyclopedia/archive page"
              : "Source URL must point to a direct article, not a home, topic, or section page",
        });
      }
    });

    if (edition.kind === "kemarin") {
      if (!edition.publicationDate) {
        context.addIssue({
          code: "custom",
          path: ["publicationDate"],
          message: "Kemarin editions must include the Perth publication date",
        });
        return;
      }
      const expected = historicalDateFromPublication(edition.publicationDate);
      if (edition.editionDate !== expected) {
        context.addIssue({
          code: "custom",
          path: ["editionDate"],
          message: `Kemarin edition date must be ${expected}`,
        });
      }
      return;
    }

    if (edition.publicationDate && edition.publicationDate !== edition.editionDate) {
      context.addIssue({
        code: "custom",
        path: ["publicationDate"],
        message: "Today's edition date and publication date must match",
      });
    }
  });

export const editionPublishSchema = editionInputSchema.and(
  z.object({
    curatorModel: z.literal("gpt-5.6-sol"),
  }),
);

export type EditionInput = z.infer<typeof editionInputSchema>;
export type EditionPublishInput = z.infer<typeof editionPublishSchema>;
export type EditionArticleInput = z.infer<typeof articleSchema>;
export type ChineseEditionInput = z.infer<typeof chineseEditionSchema>;
export type ChineseArticleInput = z.infer<typeof chineseArticleSchema>;

export interface PublishedArticle extends EditionArticleInput {
  id: string;
}

export interface PublishedEdition {
  id: string;
  kind: EditionKind;
  editionDate: string;
  publicationDate: string;
  issueNumber: number;
  mastheadDek: string;
  publishedAt: string;
  curatorModel: string;
  isDemo: boolean;
  articles: PublishedArticle[];
  translations?: {
    zhHans: ChineseEditionInput;
  };
}
