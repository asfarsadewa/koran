import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanWikiText,
  collectHistoricalCandidates,
  parseOnThisDayFeed,
  parseOnThisDayPageWikitext,
  parseYearMonthWikitext,
  skipLedger,
  wikipediaArticleUrl,
} from "../agent/lib/historical-news";

const window = {
  searchWindowStart: "1991-08-11T19:00:00.000Z",
  searchWindowEnd: "1991-08-13T07:00:00.000Z",
  editionDate: "1991-08-13",
  publicationDate: "2026-08-13",
};

const augustWikitext = `
===August===
* [[August 4]] – [[MTS Oceanos]] sinks off the Wild Coast and forces hundreds of passengers into lifeboats.
* [[August 10]]–[[August 16|16]] – [[Siege of Dubrovnik]] leaves the old city without water as the shelling continues.
* [[August 11]] – [[Nickelodeon]] introduces its series of Nicktoons.
* [[August 13]] – [[Somali Civil War]] forces more families to leave Mogadishu after nights of shelling in the capital.<ref>{{Cite news|url=https://www.nytimes.com/1991/08/14/world/mogadishu-shelling-report.html|date=August 14, 1991}}</ref>
* [[August 14]] – [[Cyclone Ruth]] crosses the northern coast and destroys several fishing villages.
* [[August 17]]–[[August 20|20]] – [[Hurricane Bob]] hits [[North Carolina]] and [[New England]], killing 17 people.
* [[August 19]] – [[1991 Soviet coup d'état attempt|an attempted coup]] places Gorbachev under house arrest.<ref>{{Cite news|url=https://www.nytimes.com/1991/08/19/world/moscow-coup-report.html}}</ref>
`;

const julyWikitext = `
===July===
* [[July 5]] – [[Bank of Credit and Commerce International]] is shut down by regulators in several countries.
* [[July 25]] – [[Yugoslav Wars]] displaces thousands of families as fighting spreads across Croatia.
`;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("historical markup parsing", () => {
  it("cleans wiki markup and builds encyclopedia article URLs", () => {
    expect(cleanWikiText("[[Somali Civil War|fighting]] in ''Mogadishu''")).toBe(
      "fighting in Mogadishu",
    );
    expect(wikipediaArticleUrl("Gulf War")).toBe("https://en.wikipedia.org/wiki/Gulf_War");
    expect(wikipediaArticleUrl("File:Map.png")).toBeNull();
  });

  it("keeps only what a paper printed that morning could have carried", () => {
    const ledger = skipLedger();
    const events = parseYearMonthWikitext(augustWikitext, 1991, window.editionDate, ledger);

    expect(events.map((event) => [event.windowFit, event.dayOffset, event.title])).toEqual([
      ["ongoing", -9, "MTS Oceanos"],
      ["ongoing", -3, "Siege of Dubrovnik"],
      ["adjacent", -2, "Nickelodeon"],
      ["exact", 0, "Somali Civil War"],
      ["adjacent", 1, "Cyclone Ruth"],
    ]);
    // Hurricane Bob on the 17th and the coup on the 19th had not happened yet.
    expect(ledger.future).toBe(2);
    expect(ledger.tooOld).toBe(0);
  });

  it("carries the citation and its date through to the candidate", () => {
    const events = parseYearMonthWikitext(augustWikitext, 1991, window.editionDate);
    expect(events.find((event) => event.title === "Somali Civil War")?.citations).toEqual([
      {
        url: "https://www.nytimes.com/1991/08/14/world/mogadishu-shelling-report.html",
        publishedAt: "1991-08-14",
      },
    ]);
  });

  it("reads the month before the printed one for crises already under way", () => {
    const ledger = skipLedger();
    const events = parseYearMonthWikitext(julyWikitext, 1991, window.editionDate, ledger);

    expect(events.map((event) => [event.windowFit, event.dayOffset, event.title])).toEqual([
      ["ongoing", -19, "Yugoslav Wars"],
    ]);
    // The 5 July collapse is 39 days back, past the ongoing lookback.
    expect(ledger.tooOld).toBe(1);
  });

  it("keeps only the matching year from an on-this-day page", () => {
    const events = parseOnThisDayPageWikitext(
      `* [[1961]] – East Germany begins the Berlin Wall.\n* [[1991]] – [[Somali Civil War]] displaces families after shelling in Mogadishu.`,
      window.editionDate,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Somali Civil War");
    expect(events[0]?.windowFit).toBe("exact");
  });

  it("reads the curated feed, which names its list after the kind requested", () => {
    const events = parseOnThisDayFeed(
      {
        selected: [
          {
            year: 1991,
            pages: [
              {
                title: "Somali_Civil_War",
                titles: { normalized: "Somali Civil War" },
                extract: "Fighting continues in Mogadishu after the government collapse.",
                content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Somali_Civil_War" } },
              },
            ],
          },
        ],
      },
      window.editionDate,
      "wikimedia:selected",
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.searchQuery).toBe("wikimedia:selected");
  });

  it("filters Wikimedia on-this-day feeds to the printed year", () => {
    const events = parseOnThisDayFeed(
      {
        events: [
          {
            year: 2015,
            text: "A later bombing.",
            pages: [{ title: "2015_Sadr_City_market_truck_bombing", extract: "A later bombing in Baghdad." }],
          },
          {
            year: 1991,
            text: "Fighting continues in Mogadishu.",
            pages: [
              {
                title: "Somali_Civil_War",
                titles: { normalized: "Somali Civil War" },
                extract: "Fighting continues in Mogadishu after the government collapse.",
                content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Somali_Civil_War" } },
              },
            ],
          },
        ],
      },
      window.editionDate,
      "wikimedia:events",
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.url).toBe("https://en.wikipedia.org/wiki/Somali_Civil_War");
    // What happened that day, not what the linked article is about in general.
    expect(events[0]?.description).toBe("Fighting continues in Mogadishu.");
  });
});

function archiveFetchMock(overrides: (href: string) => Response | null = () => null) {
  return vi.fn().mockImplementation((input: URL) => {
    const href = String(input);
    const override = overrides(href);
    if (override) return override;
    if (href.includes("prop=sections")) {
      return Response.json({
        parse: {
          sections: [
            { line: "July", index: "8" },
            { line: "August", index: "9" },
          ],
        },
      });
    }
    if (href.includes("prop=wikitext") && href.includes("section=9")) {
      return Response.json({ parse: { wikitext: augustWikitext } });
    }
    if (href.includes("prop=wikitext") && href.includes("section=8")) {
      return Response.json({ parse: { wikitext: julyWikitext } });
    }
    if (href.includes("page=August_13")) {
      return Response.json({
        parse: {
          wikitext: "* [[1991]] – [[Somali Civil War]] displaces families after shelling in Mogadishu.",
        },
      });
    }
    if (href.includes("/onthisday/")) {
      return Response.json({ events: [] });
    }
    return new Response(null, { status: 404 });
  });
}

async function runCollector(fetchMock: ReturnType<typeof vi.fn>) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-13T00:00:00.000Z"));
  vi.stubGlobal("fetch", fetchMock);
  const resultPromise = collectHistoricalCandidates(window);
  await vi.runAllTimersAsync();
  return resultPromise;
}

describe("collectHistoricalCandidates", () => {
  it("runs the archive sweep, deduplicates URLs and records both discovery surfaces", async () => {
    const result = await runCollector(archiveFetchMock());

    // Two month sections, the calendar-day page, and both on-this-day feeds.
    expect(result.searchesRun).toBe(7);
    expect(result.editionDate).toBe("1991-08-13");

    const somalia = result.results.find((item) => item.url.includes("Somali_Civil_War"));
    expect(somalia?.windowFit).toBe("exact");
    expect(somalia?.discoveredBy).toEqual(["wikipedia:year-chronology", "wikipedia:day-page"]);
    expect(somalia?.hasContemporaryEvidence).toBe(true);
    expect(somalia?.hasIndependentCorroboration).toBe(true);
    expect(somalia?.evidence.map((item) => [item.sourceType, item.timing])).toEqual([
      ["encyclopedia", "retrospective"],
      ["news", "contemporary"],
    ]);
    // Best dated fit, corroborated by a dispatch from that week: top of the ledger.
    expect(result.results[0]).toBe(somalia);
    expect(result.diagnostics.withContemporaryEvidence).toBe(1);
    expect(result.diagnostics.encyclopediaOnly).toBe(result.results.length - 1);
  });

  it("never lets a candidate dated after the printed day reach the ledger", async () => {
    const result = await runCollector(archiveFetchMock());

    const dates = result.results.map((item) => item.publishedAt.slice(0, 10));
    expect(dates).not.toContain("1991-08-17");
    expect(dates).not.toContain("1991-08-19");
    expect(result.diagnostics.excludedFuture).toBeGreaterThan(0);
    expect(result.results.every((item) => item.dayOffset <= 1 && item.dayOffset >= -30)).toBe(true);
    expect(result.diagnostics.windowFit).toEqual({ exact: 1, adjacent: 2, ongoing: 3 });
  });

  it("reports the candidates it actually discarded rather than a constant zero", async () => {
    const result = await runCollector(
      archiveFetchMock((href) => {
        if (href.includes("prop=wikitext") && href.includes("section=9")) {
          return Response.json({
            parse: {
              wikitext: [
                // Kept: the printed day itself.
                "* [[August 13]] – [[Somali Civil War]] forces more families to leave Mogadishu after shelling.",
                // Discarded: a day that does not exist in that month.
                "* [[February 30]] – [[Unknown Event]] carries a date the calendar cannot hold at all.",
              ].join("\n"),
            },
          });
        }
        if (href.includes("prop=wikitext") && href.includes("section=8")) {
          // Discarded: a day too far back to still be running on the printed morning.
          return Response.json({
            parse: {
              wikitext:
                "* [[July 2]] – [[Warsaw Pact]] is formally dissolved at a meeting of its members in Prague.",
            },
          });
        }
        if (href.includes("page=August_13")) {
          // Discarded: the on-this-day page carries every year, not just the printed one.
          return Response.json({
            parse: { wikitext: "* [[1961]] – East Germany begins building the Berlin Wall in the city." },
          });
        }
        if (href.includes("/onthisday/")) {
          return Response.json({
            events: [
              { year: "not-a-year", text: "Undated entry.", pages: [{ title: "Undated" }] },
              { year: 2015, text: "A later bombing.", pages: [{ title: "Later_Bombing" }] },
            ],
          });
        }
        return null;
      }),
    );

    expect(result.results).toHaveLength(1);
    // The July bullet and the 1961 day-page line reach back too far; the 2015 feed
    // entry from each of the two feeds lies in the future.
    expect(result.diagnostics.excludedTooOld).toBe(2);
    expect(result.diagnostics.excludedFuture).toBe(2);
    expect(result.excludedOutsideWindow).toBe(4);
    // The impossible 30 February bullet plus the non-numeric feed year from both feeds.
    expect(result.excludedWithoutTimestamp).toBe(3);
  });

  it("counts only the requests a partial year sweep actually sends", async () => {
    const fetchMock = vi.fn().mockImplementation((input: URL) => {
      const href = String(input);
      // No month sections at all, so each chronology costs one request, not two.
      if (href.includes("prop=sections")) {
        return Response.json({ parse: { sections: [{ line: "Events", index: "1" }] } });
      }
      if (href.includes("page=August_13")) {
        return Response.json({ parse: { wikitext: "" } });
      }
      if (href.includes("/onthisday/")) return Response.json({ events: [] });
      return new Response(null, { status: 404 });
    });
    const result = await runCollector(fetchMock);

    // Two chronology tables of contents with no body to follow, the day page, both feeds.
    expect(result.searchesRun).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("falls back to the per-wiki feed route when the portal endpoint is gone", async () => {
    const seen: string[] = [];
    const result = await runCollector(
      archiveFetchMock((href) => {
        if (!href.includes("/onthisday/")) return null;
        seen.push(href);
        if (href.includes("api.wikimedia.org")) return new Response(null, { status: 404 });
        if (href.includes("rest_v1/feed/onthisday/events")) {
          return Response.json({
            events: [
              {
                year: 1991,
                pages: [
                  {
                    title: "Somali_Civil_War",
                    titles: { normalized: "Somali Civil War" },
                    extract: "Fighting continues in Mogadishu after the government collapse.",
                    content_urls: {
                      desktop: { page: "https://en.wikipedia.org/wiki/Somali_Civil_War" },
                    },
                  },
                ],
              },
            ],
          });
        }
        return Response.json({ events: [] });
      }),
    );

    expect(seen.filter((href) => href.includes("api.wikimedia.org"))).toHaveLength(2);
    expect(result.diagnostics.fallbacks).toEqual([
      "events:en.wikipedia.org/api/rest_v1",
      "selected:en.wikipedia.org/api/rest_v1",
    ]);
    expect(
      result.results.find((item) => item.url.includes("Somali_Civil_War"))?.discoveredBy,
    ).toContain("wikimedia:events");
  });

  it("keeps the sweep alive and records the failure when both feed routes fail", async () => {
    const result = await runCollector(
      archiveFetchMock((href) =>
        href.includes("/onthisday/") ? new Response(null, { status: 503 }) : null,
      ),
    );

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.diagnostics.failures).toHaveLength(2);
    expect(result.diagnostics.failures[0]).toContain("HTTP 503");
  });

  it("reports a non-success Wikimedia response after the request boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T00:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const resultPromise = collectHistoricalCandidates(window);
    const assertion = expect(resultPromise).rejects.toThrow("HTTP 503");
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("rejects a window that is not exactly 36 hours", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      collectHistoricalCandidates({
        ...window,
        searchWindowStart: "1991-08-13T00:00:00.000Z",
      }),
    ).rejects.toThrow("exactly 36 hours");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
