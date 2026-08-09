import { z } from "zod";

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

const directArticleUrl = httpsUrl.refine(
  isLikelyDirectArticleUrl,
  "Source URL must point to a direct article, not a home, topic, or section page",
);

export const articleSchema = z.object({
  rank: z.number().int().min(1).max(8),
  section: z.enum(SECTION_KEYS),
  headline: z.string().trim().min(20).max(140),
  dek: z.string().trim().min(70).max(420),
  dateline: z.string().trim().min(2).max(80),
  sourceName: z.string().trim().min(2).max(100),
  sourceUrl: directArticleUrl,
  sourcePublishedAt: z.string().trim().min(10).max(40),
  impact: z.string().trim().min(50).max(280),
  imageUrl: httpsUrl.optional(),
});

export const editionInputSchema = z
  .object({
    editionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    issueNumber: z.number().int().positive().max(999_999),
    mastheadDek: z.string().trim().min(40).max(260),
    articles: z.array(articleSchema).length(8),
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
  });

export const editionPublishSchema = editionInputSchema.and(
  z.object({
    curatorModel: z.literal("gpt-5.6-sol"),
  }),
);

export type EditionInput = z.infer<typeof editionInputSchema>;
export type EditionPublishInput = z.infer<typeof editionPublishSchema>;
export type EditionArticleInput = z.infer<typeof articleSchema>;

export interface PublishedArticle extends EditionArticleInput {
  id: string;
}

export interface PublishedEdition {
  id: string;
  editionDate: string;
  issueNumber: number;
  mastheadDek: string;
  publishedAt: string;
  curatorModel: string;
  isDemo: boolean;
  articles: PublishedArticle[];
}
