import { afterEach, describe, expect, it, vi } from "vitest";

import {
  entityDates,
  harmCategoryRoots,
  placeEventDates,
  sweepHarmCategories,
  wikidataSpan,
} from "../agent/lib/historical-categories";

const edition = { year: 1991, month: 9, day: 26 };

function time(value: string, precision: number) {
  return { time: `+${value}T00:00:00Z`, precision };
}

function claim(value: ReturnType<typeof time>, rank = "normal") {
  return { rank, mainsnak: { datavalue: { value } } };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("wikidata dates", () => {
  it("reads a day, a month and a year as the span each can stand for", () => {
    expect(wikidataSpan(time("1991-09-21", 11))).toEqual({
      earliest: { year: 1991, month: 9, day: 21 },
      latest: { year: 1991, month: 9, day: 21 },
      precise: true,
    });
    expect(wikidataSpan(time("1991-09-00", 10))).toEqual({
      earliest: { year: 1991, month: 9, day: 1 },
      latest: { year: 1991, month: 9, day: 30 },
      precise: false,
    });
    expect(wikidataSpan(time("1990-00-00", 9))?.latest).toEqual({ year: 1990, month: 12, day: 31 });
  });

  it("refuses a decade, a malformed value and nothing at all", () => {
    expect(wikidataSpan(time("1990-00-00", 8))).toBeNull();
    expect(wikidataSpan({ time: "1991", precision: 11 })).toBeNull();
    expect(wikidataSpan(null)).toBeNull();
  });

  it("prefers the preferred claim and ignores a deprecated one", () => {
    const dates = entityDates({
      claims: {
        P580: [claim(time("1991-01-01", 11), "deprecated"), claim(time("1991-08-25", 11))],
        P582: [claim(time("1991-11-01", 11)), claim(time("1991-11-18", 11), "preferred")],
      },
    });
    expect(dates.start?.earliest).toEqual({ year: 1991, month: 8, day: 25 });
    expect(dates.end?.earliest).toEqual({ year: 1991, month: 11, day: 18 });
    expect(dates.point).toBeNull();
  });
});

describe("placing an article against the printed day", () => {
  const day = (value: string) => wikidataSpan(time(value, 11));
  const month = (value: string) => wikidataSpan(time(value, 10));
  const year = (value: string) => wikidataSpan(time(value, 9));

  it("places a dated incident as the chronology would", () => {
    expect(placeEventDates(edition, { point: day("1991-09-26") })).toMatchObject({
      kind: "placed",
      fit: "exact",
      dayOffset: 0,
    });
    expect(placeEventDates(edition, { point: day("1991-09-21") })).toMatchObject({
      fit: "recent",
      dayOffset: -5,
    });
  });

  it("calls a siege still open on the printed day ongoing", () => {
    expect(
      placeEventDates(edition, { start: day("1991-08-25"), end: day("1991-11-18") }),
    ).toMatchObject({ fit: "ongoing", dayOffset: -32 });
  });

  it("proves a long war was running from a coarse start and a later end", () => {
    expect(
      placeEventDates(edition, { start: year("1988-00-00"), end: day("1994-05-16") }),
    ).toMatchObject({ fit: "ongoing", dayOffset: -1364 });
  });

  it("never admits what may have begun after the presses ran", () => {
    expect(placeEventDates(edition, { point: day("1991-09-29") })).toEqual({ kind: "future" });
    // Some time in September: possibly the 27th or later.
    expect(placeEventDates(edition, { start: month("1991-09-00"), end: month("1991-10-00") }))
      .toEqual({ kind: "imprecise" });
  });

  it("does not take an end known only to the month as proof the fighting went on", () => {
    expect(
      placeEventDates(edition, { start: month("1991-06-00"), end: month("1991-09-00") }),
    ).toEqual({ kind: "too-old" });
    expect(
      placeEventDates(edition, { start: month("1991-08-00"), end: month("1991-09-00") }),
    ).toEqual({ kind: "imprecise" });
  });

  it("separates the old from the undated", () => {
    expect(placeEventDates(edition, { point: day("1991-07-01") })).toEqual({ kind: "too-old" });
    expect(placeEventDates(edition, {})).toEqual({ kind: "undated" });
  });
});

describe("sweepHarmCategories", () => {
  it("reads the year's conflicts list, not the empty one named after it", () => {
    expect(harmCategoryRoots(1991)).toContain("1991 conflicts");
    expect(harmCategoryRoots(1991)).not.toContain("Conflicts in 1991");
  });

  it("walks one level of subcategories, dates each article and keeps what fits", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn().mockImplementation((input: URL) => {
      const url = new URL(String(input));
      seen.push(url.hostname + url.search);
      const category = url.searchParams.get("gcmtitle");
      if (category === "Category:Battles in 1991") {
        return Response.json({
          query: {
            pages: [
              { ns: 0, title: "Battle of Vukovar", pageprops: { wikibase_item: "Q1" } },
              { ns: 0, title: "Battle of Khafji", pageprops: { wikibase_item: "Q2" } },
              { ns: 0, title: "Unlinked skirmish" },
              { ns: 14, title: "Category:Battles in 1991 by country" },
              { ns: 14, title: "Category:Sieges in 1991" },
            ],
          },
        });
      }
      if (category === "Category:Sieges in 1991") {
        return Response.json({
          query: {
            pages: [
              { ns: 0, title: "Siege of Varaždin Barracks", pageprops: { wikibase_item: "Q3" } },
              { ns: 0, title: "Zaire unrest", pageprops: { wikibase_item: "Q4" } },
            ],
          },
        });
      }
      if (url.hostname === "www.wikidata.org") {
        return Response.json({
          entities: {
            Q1: {
              claims: {
                P580: [claim(time("1991-08-25", 11))],
                P582: [claim(time("1991-11-18", 11))],
              },
            },
            Q2: { claims: { P585: [claim(time("1991-01-29", 11))] } },
            Q3: { claims: { P580: [claim(time("1991-09-14", 11))], P582: [claim(time("1991-09-22", 11))] } },
            Q4: { claims: { P580: [claim(time("1991-09-00", 10))] } },
          },
        });
      }
      if (url.searchParams.get("prop") === "extracts|pageimages") {
        return Response.json({
          query: {
            pages: [
              {
                title: "Battle of Vukovar",
                extract: "The Battle of Vukovar was an 87-day siege of Vukovar in eastern Croatia.",
                thumbnail: { source: "https://upload.wikimedia.org/vukovar.jpg" },
              },
              {
                title: "Siege of Varaždin Barracks",
                extract: "The siege of Varaždin Barracks was an armed confrontation in Croatia.",
              },
            ],
          },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    const pending = sweepHarmCategories("1991-09-26");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.events.map((event) => [event.title, event.windowFit, event.dayOffset])).toEqual([
      ["Battle of Vukovar", "ongoing", -32],
      // Closed on the 22nd, four days before the printed morning.
      ["Siege of Varaždin Barracks", "recent", -12],
    ]);
    expect(result.events[0]?.imageUrl).toBe("https://upload.wikimedia.org/vukovar.jpg");
    expect(result.events[0]?.url).toBe("https://en.wikipedia.org/wiki/Battle_of_Vukovar");
    expect(result.diagnostics).toEqual({
      categories: 8,
      articles: 5,
      kept: 2,
      future: 0,
      tooOld: 1,
      imprecise: 1,
      undated: 1,
    });
    // The index subcategory was never opened.
    expect(seen.some((entry) => entry.includes("by+country"))).toBe(false);
    // Seven roots, one subcategory, one Wikidata batch, one summary batch.
    expect(result.requests).toBe(10);
    expect(result.failures).toEqual([]);
  });

  it("records a failing list and carries on", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const pending = sweepHarmCategories("1992-01-10");
    await vi.runAllTimersAsync();
    const result = await pending;

    // January reads the previous year's lists too.
    expect(result.requests).toBe(14);
    expect(result.failures).toHaveLength(14);
    expect(result.failures[0]).toContain("HTTP 503");
    expect(result.events).toEqual([]);
  });
});
