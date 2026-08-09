import { z } from "zod";

import { isLikelyDirectArticleUrl } from "../../shared/edition";

export const braveNewsInputSchema = z.object({
  query: z.string().trim().min(3).max(300),
  freshness: z.enum(["pd", "pw"]).default("pd"),
  count: z.number().int().min(3).max(15).default(10),
  offset: z.number().int().min(0).max(2).default(0),
});

export const braveNewsResultSchema = z.object({
  query: z.string(),
  moreResultsAvailable: z.boolean(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      description: z.string(),
      sourceName: z.string(),
      domain: z.string(),
      publishedAt: z.string().nullable(),
      age: z.string().nullable(),
    }),
  ),
});

export const dailyCandidateResultSchema = z.object({
  searchesRun: z.number().int(),
  results: z.array(
    braveNewsResultSchema.shape.results.element.extend({
      searchQuery: z.string(),
    }),
  ),
});

export type BraveNewsInput = z.infer<typeof braveNewsInputSchema>;
export type BraveNewsResult = z.infer<typeof braveNewsResultSchema>;
export type DailyCandidateResult = z.infer<typeof dailyCandidateResultSchema>;

const DAILY_SEARCH_QUERIES = [
  "civilian casualties war conflict displacement latest",
  "earthquake flood cyclone wildfire landslide deaths latest",
  "famine hunger drought food crisis humanitarian aid",
  "outbreak epidemic health emergency industrial disaster",
  "human rights repression refugees migration crisis",
  "UN humanitarian emergency civilians casualties",
  "latest world war disaster famine crisis",
] as const;

type JsonRecord = Record<string, unknown>;

let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanSnippet(value: unknown, maxLength: number): string {
  const raw = text(value) ?? "";
  return raw
    .replace(/<[^>]+>/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

async function waitForRateWindow(): Promise<void> {
  const remaining = 1_100 - (Date.now() - lastRequestAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  lastRequestAt = Date.now();
}

function queued<T>(operation: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(async () => {
    await waitForRateWindow();
    return operation();
  });
  requestQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function searchBraveNews(
  rawInput: BraveNewsInput,
  apiKey: string,
  signal?: AbortSignal,
): Promise<BraveNewsResult> {
  const input = braveNewsInputSchema.parse(rawInput);
  if (!apiKey) throw new Error("BRAVE_API_KEY is not configured");

  return queued(async () => {
    const searchUrl = new URL("https://api.search.brave.com/res/v1/news/search");
    searchUrl.search = new URLSearchParams({
      q: input.query,
      count: String(input.count),
      offset: String(input.offset),
      freshness: input.freshness,
      country: "ALL",
      search_lang: "en",
      safesearch: "moderate",
      spellcheck: "true",
      operators: "true",
    }).toString();

    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(searchUrl, {
        headers: {
          accept: "application/json",
          "x-subscription-token": apiKey,
        },
        signal,
      });
      if (response.status !== 429) break;

      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter)
        ? Math.max(retryAfter * 1_000, 1_500)
        : 1_500 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      lastRequestAt = Date.now();
    }
    if (!response) throw new Error("Brave News Search returned no response");
    if (!response.ok) {
      throw new Error(`Brave News Search failed with HTTP ${response.status}`);
    }

    const payload = record(await response.json());
    const query = record(payload?.query);
    const candidates = Array.isArray(payload?.results) ? payload.results : [];
    const results = candidates.flatMap((candidate) => {
      const item = record(candidate);
      const url = text(item?.url);
      const title = cleanSnippet(item?.title, 300);
      const description = cleanSnippet(item?.description, 600);
      if (!url || !title || !description) return [];

      let domain: string;
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "https:") return [];
        domain = parsedUrl.hostname.replace(/^www\./u, "");
      } catch {
        return [];
      }
      if (!isLikelyDirectArticleUrl(url)) return [];

      const profile = record(item?.profile);
      const metaUrl = record(item?.meta_url);
      const sourceName =
        cleanSnippet(profile?.long_name ?? profile?.name ?? metaUrl?.hostname, 120) || domain;

      return [
        {
          title,
          url,
          description,
          sourceName,
          domain,
          publishedAt: text(item?.page_age),
          age: text(item?.age),
        },
      ];
    });

    return braveNewsResultSchema.parse({
      query: text(query?.original) ?? input.query,
      moreResultsAvailable: query?.more_results_available === true,
      results,
    });
  });
}

export async function collectDailyCandidates(
  apiKey: string,
  signal?: AbortSignal,
): Promise<DailyCandidateResult> {
  const byUrl = new Map<string, DailyCandidateResult["results"][number]>();

  for (const query of DAILY_SEARCH_QUERIES) {
    const search = await searchBraveNews(
      { query, freshness: "pd", count: 15, offset: 0 },
      apiKey,
      signal,
    );
    for (const result of search.results) {
      if (!byUrl.has(result.url)) byUrl.set(result.url, { ...result, searchQuery: query });
    }
  }

  return dailyCandidateResultSchema.parse({
    searchesRun: DAILY_SEARCH_QUERIES.length,
    results: [...byUrl.values()],
  });
}
