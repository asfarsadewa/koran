import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanWikiText,
  collectHistoricalCandidates,
  parseOnThisDayFeed,
  parseOnThisDayPageWikitext,
  parseYearMonthWikitext,
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
* [[August 11]] – [[Nickelodeon]] introduces its series of Nicktoons.
* [[August 13]] – [[Somali Civil War]] forces more families to leave Mogadishu after nights of shelling in the capital.
* [[August 17]]–[[August 20|20]] – [[Hurricane Bob]] hits [[North Carolina]] and [[New England]], killing 17 people.
* [[August 19]] – [[1991 Soviet coup d'état attempt|an attempted coup]] places Gorbachev under house arrest.<ref>{{Cite news|url=https://www.nytimes.com/1991/08/19/world/moscow-coup-report.html}}</ref>
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

  it("keeps dated month bullets and classifies them against the 36-hour window", () => {
    const start = Date.parse(window.searchWindowStart);
    const end = Date.parse(window.searchWindowEnd);
    const events = parseYearMonthWikitext(augustWikitext, 1991, window.editionDate, start, end);

    expect(events.map((event) => [event.windowFit, event.title])).toEqual([
      ["adjacent", "Nickelodeon"],
      ["exact", "Somali Civil War"],
      ["month", "Hurricane Bob"],
      ["month", "1991 Soviet coup d'état attempt"],
    ]);
    expect(events.find((event) => event.title.includes("coup"))?.corroboratingUrls).toContain(
      "https://www.nytimes.com/1991/08/19/world/moscow-coup-report.html",
    );
  });

  it("keeps only the matching year from an on-this-day page", () => {
    const events = parseOnThisDayPageWikitext(
      `* [[1961]] – East Germany begins the Berlin Wall.\n* [[1991]] – [[Somali Civil War]] displaces families after shelling in Mogadishu.`,
      window.editionDate,
      Date.parse(window.searchWindowStart),
      Date.parse(window.searchWindowEnd),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Somali Civil War");
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
      Date.parse(window.searchWindowStart),
      Date.parse(window.searchWindowEnd),
      "wikimedia:events",
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.url).toBe("https://en.wikipedia.org/wiki/Somali_Civil_War");
  });
});

describe("collectHistoricalCandidates", () => {
  it("runs the archive sweep and deduplicates encyclopedia URLs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T00:00:00.000Z"));
    const fetchMock = vi.fn().mockImplementation((input: URL) => {
      const href = String(input);
      if (href.includes("prop=sections")) {
        return Response.json({
          parse: { sections: [{ line: "August", index: "9" }] },
        });
      }
      if (href.includes("prop=wikitext") && href.includes("section=9")) {
        return Response.json({ parse: { wikitext: augustWikitext } });
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
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = collectHistoricalCandidates(window);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.searchesRun).toBe(5);
    expect(result.editionDate).toBe("1991-08-13");
    expect(result.results.some((item) => item.url.includes("Somali_Civil_War"))).toBe(true);
    expect(result.results[0]?.windowFit).toBe("exact");
  });

  it("reports the candidates it actually discarded rather than a constant zero", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T00:00:00.000Z"));
    const fetchMock = vi.fn().mockImplementation((input: URL) => {
      const href = String(input);
      if (href.includes("prop=sections")) {
        return Response.json({ parse: { sections: [{ line: "August", index: "9" }] } });
      }
      if (href.includes("prop=wikitext") && href.includes("section=9")) {
        return Response.json({
          parse: {
            wikitext: [
              // Kept: the printed day itself.
              "* [[August 13]] – [[Somali Civil War]] forces more families to leave Mogadishu after shelling.",
              // Discarded: a different month of the same year.
              "* [[December 25]] – [[Dissolution of the Soviet Union]] ends the union after the December accords.",
              // Discarded: a day that does not exist in that month.
              "* [[February 30]] – [[Unknown Event]] carries a date the calendar cannot hold at all.",
            ].join("\n"),
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
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = collectHistoricalCandidates(window);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.results).toHaveLength(1);
    // December bullet, the 1961 day-page line, and the 2015 feed entry — two feeds are polled.
    expect(result.excludedOutsideWindow).toBe(4);
    // The impossible 30 February bullet plus the non-numeric feed year from both feeds.
    expect(result.excludedWithoutTimestamp).toBe(3);
  });

  it("counts only the requests a partial year sweep actually sends", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T00:00:00.000Z"));
    const fetchMock = vi.fn().mockImplementation((input: URL) => {
      const href = String(input);
      // No August section, so the year chronology costs one request, not two.
      if (href.includes("prop=sections")) {
        return Response.json({ parse: { sections: [{ line: "July", index: "8" }] } });
      }
      if (href.includes("page=August_13")) {
        return Response.json({ parse: { wikitext: "" } });
      }
      if (href.includes("/onthisday/")) return Response.json({ events: [] });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = collectHistoricalCandidates(window);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.searchesRun).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(4);
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
