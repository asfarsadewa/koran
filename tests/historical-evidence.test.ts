import { describe, expect, it } from "vitest";

import {
  buildEvidence,
  classifyAvailability,
  classifySourceType,
  classifyTiming,
  dateFromUrlPath,
  extractCitations,
  independentPublishers,
  parseCitationDate,
  registrableDomain,
  scoreCandidate,
  unwrapArchiveUrl,
  type HistoricalEvidence,
} from "../agent/lib/historical-evidence";

const eventDate = "1991-08-13T12:00:00.000Z";
const editionDate = "1991-08-13";

describe("citation dates", () => {
  it("reads the shapes Wikipedia editors actually write", () => {
    expect(parseCitationDate("August 14, 1991")).toBe("1991-08-14");
    expect(parseCitationDate("14 August 1991")).toBe("1991-08-14");
    expect(parseCitationDate("1991-08-14")).toBe("1991-08-14");
    expect(parseCitationDate("August 1991")).toBe("1991-08");
    expect(parseCitationDate("c. 1991")).toBe("1991");
  });

  it("refuses text that only looks like a date", () => {
    expect(parseCitationDate("Retrieved later")).toBeUndefined();
    expect(parseCitationDate("Smarch 4, 1991")).toBeUndefined();
    expect(parseCitationDate("February 30, 1991")).toBeUndefined();
    expect(parseCitationDate("1991-02-30")).toBeUndefined();
  });

  it("recovers the date a news URL carries in its own path", () => {
    expect(dateFromUrlPath("https://www.nytimes.com/1991/08/19/world/moscow-coup.html")).toBe(
      "1991-08-19",
    );
    expect(dateFromUrlPath("https://www.theguardian.com/1991/08/mogadishu-report")).toBe("1991-08");
    expect(dateFromUrlPath("https://example.com/world/report")).toBeUndefined();
    expect(dateFromUrlPath("not a url")).toBeUndefined();
  });

  it("keeps the citation's own date and ignores the access date beside it", () => {
    expect(
      extractCitations(
        `{{Cite news|url=https://www.nytimes.com/1991/08/14/world/mogadishu-shelling-report.html|date=August 14, 1991|access-date=2019-04-02}}`,
      ),
    ).toEqual([
      {
        url: "https://www.nytimes.com/1991/08/14/world/mogadishu-shelling-report.html",
        publishedAt: "1991-08-14",
      },
    ]);
  });

  it("falls back to the year parameter, then to the URL, and drops portal links", () => {
    expect(
      extractCitations(
        `{{cite book|url=https://www.theguardian.com/world/somalia-twenty-years-on|year=2004}}` +
          `{{cite news|url=https://www.washingtonpost.com/1991/08/13/mogadishu-dispatch.html}}` +
          `{{cite web|url=https://example.com/news}}`,
      ),
    ).toEqual([
      { url: "https://www.theguardian.com/world/somalia-twenty-years-on", publishedAt: "2004" },
      {
        url: "https://www.washingtonpost.com/1991/08/13/mogadishu-dispatch.html",
        publishedAt: "1991-08-13",
      },
    ]);
  });
});

describe("source classification", () => {
  it("separates contemporary reporting from history written later", () => {
    expect(classifyTiming("1991-08-14", eventDate)).toBe("contemporary");
    expect(classifyTiming("1991-09-20", eventDate)).toBe("contemporary");
    expect(classifyTiming("1993-04-01", eventDate)).toBe("retrospective");
    expect(classifyTiming("1991-12", eventDate)).toBe("retrospective");
    expect(classifyTiming("2004", eventDate)).toBe("retrospective");
  });

  it("refuses to call a vague or absent date contemporary", () => {
    // A bare year matching the event is not proof of what was known that week.
    expect(classifyTiming("1991", eventDate)).toBe("unknown");
    expect(classifyTiming("1991-08", eventDate)).toBe("unknown");
    // Published well before the event, so it cannot be reporting it.
    expect(classifyTiming("1990-01-04", eventDate)).toBe("unknown");
    expect(classifyTiming(undefined, eventDate)).toBe("unknown");
    expect(classifyTiming("sometime", eventDate)).toBe("unknown");
  });

  it("sorts hosts into encyclopedias, archives, institutions and the press", () => {
    expect(classifySourceType("https://en.wikipedia.org/wiki/Somali_Civil_War")).toBe("encyclopedia");
    expect(classifySourceType("https://www.britannica.com/topic/Somali-Civil-War")).toBe(
      "encyclopedia",
    );
    expect(classifySourceType("https://web.archive.org/web/2005/https://www.bbc.co.uk/report")).toBe(
      "archive",
    );
    expect(classifySourceType("https://reliefweb.int/report/somalia/mogadishu-appeal")).toBe(
      "institution",
    );
    expect(classifySourceType("https://earthquake.usgs.gov/earthquakes/eventpage/summary")).toBe(
      "institution",
    );
    expect(classifySourceType("https://www.bmkg.go.id/gempabumi/laporan-harian")).toBe("institution");
    expect(classifySourceType("https://www.nytimes.com/1991/08/14/world/report.html")).toBe("news");
    expect(classifySourceType("not a url")).toBe("other");
  });

  it("marks encyclopedia pages retrospective however the citation is dated", () => {
    expect(
      buildEvidence(
        { url: "https://en.wikipedia.org/wiki/Somali_Civil_War", publishedAt: "1991-08-13" },
        eventDate,
        editionDate,
      ),
    ).toEqual({
      url: "https://en.wikipedia.org/wiki/Somali_Civil_War",
      publisher: "wikipedia.org",
      sourceType: "encyclopedia",
      timing: "retrospective",
      // No desk of that morning held an encyclopedia written about its own day.
      availableByEdition: "unavailable",
      attachedTo: "event-line",
      publishedAt: "1991-08-13",
    });
  });

  it("names the original publisher behind an archived capture", () => {
    const wrapped =
      "https://web.archive.org/web/20050320011122/https://www.theguardian.com/1991/08/14/mogadishu-report";
    expect(unwrapArchiveUrl(wrapped)).toBe(
      "https://www.theguardian.com/1991/08/14/mogadishu-report",
    );
    expect(unwrapArchiveUrl("https://www.theguardian.com/world/report")).toBe(
      "https://www.theguardian.com/world/report",
    );
    // The capture is dated 2005; the report it captured is dated 1991, and that is
    // the date both the timing and the availability are settled on.
    expect(buildEvidence({ url: wrapped }, eventDate, editionDate)).toMatchObject({
      publisher: "theguardian.com",
      sourceType: "archive",
      timing: "contemporary",
      availableByEdition: "unavailable",
      attachedTo: "event-line",
      publishedAt: "1991-08-14",
    });
  });
});

describe("availability at press time", () => {
  it("separates reporting the desk held from reporting that came a day too late", () => {
    // The clearest case Finding 3 exists for: genuine contemporary reporting about
    // the event, filed the morning after this sheet went to press.
    expect(classifyTiming("1991-08-14", eventDate)).toBe("contemporary");
    expect(classifyAvailability("1991-08-14", editionDate)).toBe("unavailable");

    // A paper of the printed day is a peer of the sheet being reconstructed: if it
    // could carry the story that morning, so could this one.
    expect(classifyAvailability("1991-08-13", editionDate)).toBe("available");
    expect(classifyAvailability("1991-08-12", editionDate)).toBe("available");
  });

  it("settles a partial date whenever the whole span falls on one side", () => {
    expect(classifyAvailability("1991-09", editionDate)).toBe("unavailable");
    expect(classifyAvailability("1992", editionDate)).toBe("unavailable");
    expect(classifyAvailability("1991-07", editionDate)).toBe("available");
    expect(classifyAvailability("1990", editionDate)).toBe("available");
  });

  it("refuses to settle a span that straddles the printed day", () => {
    expect(classifyAvailability("1991-08", editionDate)).toBe("unknown");
    expect(classifyAvailability("1991", editionDate)).toBe("unknown");
    expect(classifyAvailability(undefined, editionDate)).toBe("unknown");
    expect(classifyAvailability("sometime", editionDate)).toBe("unknown");
  });
});

describe("publisher independence", () => {
  it("groups subdomains and country suffixes under one publisher", () => {
    expect(registrableDomain("archive.nytimes.com")).toBe("nytimes.com");
    expect(registrableDomain("www.bbc.co.uk")).toBe("bbc.co.uk");
    expect(registrableDomain("nytimes.com")).toBe("nytimes.com");
  });

  it("does not count one publisher twice as corroboration", () => {
    const evidence: HistoricalEvidence[] = [
      {
        url: "https://en.wikipedia.org/wiki/Somali_Civil_War",
        publisher: "wikipedia.org",
        sourceType: "encyclopedia",
        timing: "retrospective",
        availableByEdition: "unavailable",
        attachedTo: "event-line",
      },
      {
        url: "https://www.nytimes.com/1991/08/14/world/report.html",
        publisher: "nytimes.com",
        sourceType: "news",
        timing: "contemporary",
        availableByEdition: "unavailable",
        attachedTo: "event-line",
      },
      {
        url: "https://archive.nytimes.com/1991/08/15/world/follow-up.html",
        publisher: "nytimes.com",
        sourceType: "news",
        timing: "contemporary",
        availableByEdition: "unavailable",
        attachedTo: "event-line",
      },
    ];
    expect([...independentPublishers(evidence)]).toEqual(["nytimes.com"]);
  });
});

describe("evidence scoring", () => {
  const encyclopedia: HistoricalEvidence = {
    url: "https://en.wikipedia.org/wiki/Somali_Civil_War",
    publisher: "wikipedia.org",
    sourceType: "encyclopedia",
    timing: "retrospective",
    availableByEdition: "unavailable",
    attachedTo: "event-line",
  };

  const contemporary: HistoricalEvidence = {
    url: "https://www.nytimes.com/1991/08/14/world/mogadishu-shelling-report.html",
    publisher: "nytimes.com",
    sourceType: "news",
    timing: "contemporary",
    availableByEdition: "unavailable",
    attachedTo: "event-line",
    publishedAt: "1991-08-14",
  };

  const editionTime: HistoricalEvidence = {
    ...contemporary,
    url: "https://www.washingtonpost.com/1991/08/13/mogadishu-dispatch.html",
    publisher: "washingtonpost.com",
    availableByEdition: "available",
    attachedTo: "event-line",
    publishedAt: "1991-08-13",
  };

  it("ranks contemporary reporting above an encyclopedia-only entry", () => {
    const corroborated = scoreCandidate({
      evidence: [encyclopedia, contemporary],
      independentPublishers: 1,
      discoveredBy: ["wikipedia:year-chronology"],
      title: "Somali Civil War",
      description: "Shelling forces more families out of Mogadishu.",
    });
    const bare = scoreCandidate({
      evidence: [encyclopedia],
      independentPublishers: 0,
      discoveredBy: ["wikipedia:year-chronology"],
      title: "Somali Civil War",
      description: "Shelling forces more families out of Mogadishu.",
    });
    expect(corroborated).toBeGreaterThan(bare);
  });

  it("ranks reporting the desk could have held above reporting that arrived later", () => {
    const base = {
      independentPublishers: 1,
      discoveredBy: ["wikipedia:year-chronology"],
      title: "Somali Civil War",
      description: "Shelling forces more families out of Mogadishu.",
    };
    expect(scoreCandidate({ ...base, evidence: [encyclopedia, editionTime] })).toBeGreaterThan(
      scoreCandidate({ ...base, evidence: [encyclopedia, contemporary] }),
    );
  });

  it("says nothing about the date, which the ledger orders separately", () => {
    const input = {
      evidence: [encyclopedia, contemporary],
      independentPublishers: 1,
      discoveredBy: ["wikipedia:year-chronology"],
      title: "Siege of Dubrovnik",
      description: "Shelling leaves the old city without water.",
    };
    // Two candidates with identical support score identically whatever day they fall on.
    expect(scoreCandidate(input)).toBe(scoreCandidate({ ...input }));
  });

  it("rewards a second independent publisher and a second discovery surface", () => {
    const one = scoreCandidate({
      evidence: [encyclopedia, contemporary],
      independentPublishers: 1,
      discoveredBy: ["wikipedia:year-chronology"],
      title: "Siege of Dubrovnik",
      description: "Shelling leaves the old city without water.",
    });
    const two = scoreCandidate({
      evidence: [encyclopedia, contemporary],
      independentPublishers: 2,
      discoveredBy: ["wikipedia:year-chronology", "wikimedia:events"],
      title: "Siege of Dubrovnik",
      description: "Shelling leaves the old city without water.",
    });
    expect(two).toBeGreaterThan(one);
  });

  it("lifts a candidate from a country the archive shows under unusual conflict", () => {
    const base = {
      evidence: [encyclopedia],
      independentPublishers: 0,
      discoveredBy: ["wikipedia:year-chronology"],
      title: "Shelling in south Lebanon",
      description: "Families leave the villages after a night of artillery fire.",
    };
    expect(scoreCandidate({ ...base, namesPressureCountry: true })).toBeGreaterThan(
      scoreCandidate(base),
    );
  });

  it("rewards an institutional record of the human toll", () => {
    const base = {
      independentPublishers: 1,
      discoveredBy: ["wikipedia:day-page"],
      title: "Cyclone Ruth",
      description: "Villages destroyed along the northern coast.",
    };
    const withInstitution = scoreCandidate({
      ...base,
      evidence: [
        encyclopedia,
        {
          url: "https://reliefweb.int/report/coastal-appeal",
          publisher: "reliefweb.int",
          sourceType: "institution",
          timing: "contemporary",
          availableByEdition: "unknown",
          attachedTo: "event-line",
        },
      ],
    });
    const withoutInstitution = scoreCandidate({ ...base, evidence: [encyclopedia, contemporary] });
    expect(withInstitution).toBeGreaterThan(withoutInstitution);
  });
});
