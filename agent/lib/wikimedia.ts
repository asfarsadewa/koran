/**
 * One polite queue for every Wikimedia host the Kemarin sweep reads. Wikipedia,
 * Wikidata and the feed portal share an operator and a rate policy, so they share
 * the spacing between requests too.
 */
export const WIKIMEDIA_USER_AGENT =
  "JuaraMerdeka/0.1 (https://koran.r3ptil.com; kemarin-historical-desk)";

const FILE_OR_CATEGORY = /^(?:File|Image|Category|Special|Wikipedia|Template|Help):/iu;

let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

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

export async function wikimediaGet(url: URL, signal?: AbortSignal): Promise<unknown> {
  return queued(async () => {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": WIKIMEDIA_USER_AGENT,
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
    if (!response) throw new Error("Wikimedia returned no response");
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Wikimedia request failed with HTTP ${response.status}`);
    }
    return response.json();
  });
}

export function wikiApiUrl(params: Record<string, string>): URL {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params }).toString();
  return url;
}

export function wikipediaArticleUrl(title: string): string | null {
  const trimmed = title.replace(/_/gu, " ").trim();
  if (!trimmed || FILE_OR_CATEGORY.test(trimmed)) return null;
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(trimmed).replace(/%20/gu, "_")}`;
}

/** The inverse, so a candidate discovered as a URL can be sent back for its references. */
export function wikipediaTitleFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname.replace(/^www\./u, "") !== "en.wikipedia.org") return null;
    const path = /^\/wiki\/(.+)$/u.exec(url.pathname)?.[1];
    if (!path) return null;
    const title = decodeURIComponent(path).replace(/_/gu, " ").trim();
    return title && !FILE_OR_CATEGORY.test(title) ? title : null;
  } catch {
    return null;
  }
}

type JsonRecord = Record<string, unknown>;

export function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
