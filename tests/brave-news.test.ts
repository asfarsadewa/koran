import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function loadBraveNews() {
  return import("../agent/lib/brave-news");
}

function braveResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      query: { original: "humanitarian crisis", more_results_available: true },
      results: [
        {
          title: "Aid &amp; access <strong>narrows</strong>",
          url: "https://news.example/world/report-on-humanitarian-access",
          description: "Relief agencies report <em>serious</em> shortages.",
          age: "2 hours ago",
          page_age: "2026-08-09T00:00:00Z",
          profile: { long_name: "Example News" },
        },
        {
          title: "Insecure result",
          url: "http://news.example/world/insecure",
          description: "This result must not pass the HTTPS boundary.",
        },
        {
          title: "Section result",
          url: "https://news.example/world/news",
          description: "This result points to a section index.",
        },
      ],
      ...overrides,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function candidate(
  slug: string,
  pageAge: string | null,
  overrides: Record<string, unknown> = {},
) {
  return {
    title: `Verified report ${slug} with sufficient detail`,
    url: `https://news.example/world/verified-report-${slug}`,
    description: `Relief agencies report serious consequences in the verified ${slug} dispatch.`,
    page_age: pageAge,
    profile: { long_name: "Example News" },
    ...overrides,
  };
}

const editorialWindow = {
  searchWindowStart: "2026-08-07T12:00:00.000Z",
  searchWindowEnd: "2026-08-09T00:00:00.000Z",
};

describe("searchBraveNews", () => {
  it("returns bounded, normalized HTTPS news snippets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(braveResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { searchBraveNews } = await loadBraveNews();

    const output = await searchBraveNews(
      { query: "humanitarian crisis", freshness: "pd", count: 3, offset: 0 },
      "test-api-key",
    );

    expect(output.moreResultsAvailable).toBe(true);
    expect(output.results).toEqual([
      {
        title: "Aid & access narrows",
        url: "https://news.example/world/report-on-humanitarian-access",
        description: "Relief agencies report serious shortages.",
        sourceName: "Example News",
        domain: "news.example",
        publishedAt: "2026-08-09T00:00:00Z",
        age: "2 hours ago",
      },
    ]);

    const [requestUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.searchParams.get("country")).toBe("ALL");
    expect(requestUrl.searchParams.get("freshness")).toBe("pd");
    expect(new Headers(init.headers).get("x-subscription-token")).toBe("test-api-key");
  });

  it("fails before making a request when the key is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { searchBraveNews } = await loadBraveNews();

    await expect(
      searchBraveNews(
        { query: "humanitarian crisis", freshness: "pd", count: 3, offset: 0 },
        "",
      ),
    ).rejects.toThrow("BRAVE_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a rate-limited request and honors the bounded attempt count", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T00:00:00.000Z"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(braveResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { searchBraveNews } = await loadBraveNews();

    const resultPromise = searchBraveNews(
      { query: "humanitarian crisis", freshness: "pd", count: 3, offset: 0 },
      "test-api-key",
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toMatchObject({ query: "humanitarian crisis" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a non-success response after the request boundary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const { searchBraveNews } = await loadBraveNews();
    await expect(
      searchBraveNews(
        { query: "humanitarian crisis", freshness: "pd", count: 3, offset: 0 },
        "test-api-key",
      ),
    ).rejects.toThrow("HTTP 503");
  });
});

describe("collectDailyCandidates", () => {
  it("runs seven calendar-range searches and deduplicates inside the exact window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T00:00:00.000Z"));
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(braveResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const { collectDailyCandidates } = await loadBraveNews();

    const resultPromise = collectDailyCandidates("test-api-key", editorialWindow);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.searchesRun).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.searchQuery).toContain("civilian casualties");
    expect(result).toMatchObject({
      ...editorialWindow,
      freshnessRange: "2026-08-07to2026-08-09",
      excludedOutsideWindow: 0,
      excludedWithoutTimestamp: 0,
    });
    for (const [requestUrl] of fetchMock.mock.calls as [URL, RequestInit][]) {
      expect(requestUrl.searchParams.get("freshness")).toBe("2026-08-07to2026-08-09");
      expect(requestUrl.searchParams.get("count")).toBe("30");
    }
  });

  it("keeps both 36-hour boundaries and rejects older, future, and undated candidates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(editorialWindow.searchWindowEnd));
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        braveResponse({
          results: [
            candidate("at-window-start", editorialWindow.searchWindowStart),
            candidate("at-window-end", editorialWindow.searchWindowEnd),
            candidate("one-millisecond-too-old", "2026-08-07T11:59:59.999Z"),
            candidate("one-millisecond-too-new", "2026-08-09T00:00:00.001Z"),
            candidate("missing-timestamp", null),
            candidate("invalid-timestamp", "waktu tidak diketahui"),
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { collectDailyCandidates } = await loadBraveNews();

    const resultPromise = collectDailyCandidates("test-api-key", editorialWindow);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.results.map((result) => result.url)).toEqual([
      "https://news.example/world/verified-report-at-window-start",
      "https://news.example/world/verified-report-at-window-end",
    ]);
    expect(result.excludedOutsideWindow).toBe(2);
    expect(result.excludedWithoutTimestamp).toBe(2);
  });

  it("rejects anything other than an exact 36-hour window before calling Brave", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { collectDailyCandidates } = await loadBraveNews();

    await expect(
      collectDailyCandidates("test-api-key", {
        searchWindowStart: "2026-08-08T00:00:00.000Z",
        searchWindowEnd: "2026-08-09T00:00:00.000Z",
      }),
    ).rejects.toThrow("exactly 36 hours");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
