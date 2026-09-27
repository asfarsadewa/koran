import { afterEach, describe, expect, it, vi } from "vitest";

import {
  archiveMonths,
  collectNytReports,
  parseNytArchive,
  reportsHarm,
} from "../agent/lib/nyt-archive";

function doc(overrides: Record<string, unknown> = {}) {
  return {
    web_url: "https://www.nytimes.com/1991/09/26/world/european-soldiers-restore-calm-in-zaire.html",
    headline: { main: "European Soldiers Restore Calm In Zaire Capital" },
    abstract: "French and Belgian troops helped restore calm to the Zairian capital after looting.",
    pub_date: "1991-09-26T05:00:00+0000",
    document_type: "article",
    type_of_material: "News",
    news_desk: "Foreign Desk",
    section_name: "World",
    print_page: "6",
    word_count: 900,
    ...overrides,
  };
}

function archive(...docs: unknown[]) {
  return { response: { docs } };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("parseNytArchive", () => {
  it("keeps the issues from three days before the printed day up to it", () => {
    const { events, scanned } = parseNytArchive(
      [
        archive(
          doc(),
          doc({
            web_url: "https://www.nytimes.com/1991/09/23/world/older-report-from-the-desk.html",
            pub_date: "1991-09-23T05:00:00+0000",
          }),
          doc({
            web_url: "https://www.nytimes.com/1991/09/22/world/too-old-for-the-wire.html",
            pub_date: "1991-09-22T05:00:00+0000",
          }),
          doc({
            web_url: "https://www.nytimes.com/1991/09/27/world/the-next-morning.html",
            pub_date: "1991-09-27T05:00:00+0000",
          }),
        ),
      ],
      "1991-09-26",
    );

    expect(scanned).toBe(4);
    expect(events.map((event) => [event.windowFit, event.dayOffset])).toEqual([
      ["exact", 0],
      ["recent", -3],
    ]);
    expect(events[0]).toMatchObject({
      sourceName: "The New York Times",
      searchQuery: "nyt:archive",
      title: "European Soldiers Restore Calm In Zaire Capital",
    });
  });

  it("reads the foreign desk only, harm first", () => {
    const { events } = parseNytArchive(
      [
        archive(
          doc({
            web_url: "https://www.nytimes.com/1991/09/26/world/ukrainian-leader-and-bush-confer.html",
            headline: { main: "Ukrainian Leader and Bush Confer" },
            abstract: "The Ukrainian leader met with President Bush today to discuss the economy.",
          }),
          doc({
            web_url: "https://www.nytimes.com/1991/09/26/world/storm-floods-bangladesh-coast.html",
            headline: { main: "Storm Floods Bangladesh Coast" },
            abstract: "Floodwater forced hundreds of families from their homes along the delta.",
          }),
          doc({
            web_url: "https://www.nytimes.com/1991/09/24/us/crack-hits-chicago-along-with-a-wave-of-killing.html",
            headline: { main: "Crack Hits Chicago, Along With a Wave of Killing" },
            abstract: "Street gangs are fighting over the crack trade, and the killings have risen.",
            pub_date: "1991-09-24T05:00:00+0000",
            news_desk: "National Desk",
            section_name: "U.S.",
          }),
          doc({
            web_url: "https://www.nytimes.com/1991/09/26/nyregion/fire-in-the-bronx-kills-four.html",
            headline: { main: "Fire in the Bronx Kills Four" },
            news_desk: "Metropolitan Desk",
            section_name: "New York",
          }),
          doc({
            web_url: "https://www.nytimes.com/1991/09/26/opinion/letter-on-zaire-looting.html",
            type_of_material: "Letter",
          }),
        ),
      ],
      "1991-09-26",
    );

    // Harm first; the diplomatic report still comes along from the foreign desk. The
    // national desk's city crime and the metropolitan fire stay out.
    expect(events.map((event) => event.title)).toEqual([
      "Storm Floods Bangladesh Coast",
      "Ukrainian Leader and Bush Confer",
    ]);
  });

  it("drops a report too thin to check and strips the archive's lead marker", () => {
    const { events } = parseNytArchive(
      [
        archive(
          doc({ abstract: "", lead_paragraph: "LEAD: Troops fired on crowds of looters in Kinshasa today." }),
          doc({
            web_url: "https://www.nytimes.com/1991/09/26/world/brief-item-without-text.html",
            abstract: "",
            lead_paragraph: "",
          }),
        ),
        { response: "not an archive" },
      ],
      "1991-09-26",
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.description).toBe("Troops fired on crowds of looters in Kinshasa today.");
  });

  it("recognises unrest the evidence scorer's vocabulary misses", () => {
    expect(reportsHarm("Troops restore calm after looting")).toBe(true);
    expect(reportsHarm("Ukrainian leader and Bush confer")).toBe(false);
  });
});

describe("collectNytReports", () => {
  it("reads the previous month when the lookback crosses into it", () => {
    expect(archiveMonths("1991-09-26")).toEqual([{ year: 1991, month: 9 }]);
    expect(archiveMonths("1991-10-02")).toEqual([
      { year: 1991, month: 9 },
      { year: 1991, month: 10 },
    ]);
    expect(archiveMonths("1992-01-01")).toEqual([
      { year: 1991, month: 12 },
      { year: 1992, month: 1 },
    ]);
  });

  it("says so when no key is configured, without calling the archive", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await collectNytReports("1991-09-26", undefined);
    expect(result.diagnostics).toEqual({ status: "no-key", scanned: 0, kept: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the month after one rate-limit answer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json(archive(doc())));
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    const pending = collectNytReports("1991-09-26", "secret-key");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.diagnostics).toEqual({ status: "ok", scanned: 1, kept: 1 });
    expect(result.requests).toBe(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://api.nytimes.com/svc/archive/v1/1991/9.json",
    );
  });

  it("reports a failed archive as failed", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const pending = collectNytReports("1991-09-26", "secret-key");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.diagnostics.status).toBe("failed");
    expect(result.failures).toEqual(["nyt:archive 1991-09 HTTP 401"]);
    expect(result.failures.join(" ")).not.toContain("secret-key");
  });

  it("gives up after a second rate-limit answer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
    const pending = collectNytReports("1991-09-26", "secret-key");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.failures).toEqual(["nyt:archive 1991-09 HTTP 429"]);
  });
});
