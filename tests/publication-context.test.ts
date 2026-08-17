import { describe, expect, it } from "vitest";

import {
  buildEditorialWindow,
  buildKemarinPublicationContext,
  buildPublicationContext,
  EDITORIAL_WINDOW_HOURS,
  EDITORIAL_WINDOW_MS,
  shiftPerthInstantByYears,
} from "../agent/lib/publication-context";
import { historicalDateFromPublication, KEMARIN_OFFSET_YEARS } from "../shared/calendar";

describe("buildPublicationContext", () => {
  it("uses the Perth calendar day at the 07.00 publication boundary", () => {
    const context = buildPublicationContext(new Date("2026-08-08T23:00:00.000Z"));
    expect(context.editionDate).toBe("2026-08-09");
    expect(context.issueNumber).toBe(1);
    expect(context.publicationTime).toBe("07.00 WITA");
  });

  it("increments the issue number by local publication day", () => {
    const context = buildPublicationContext(new Date("2026-08-10T00:15:00.000Z"));
    expect(context.editionDate).toBe("2026-08-10");
    expect(context.issueNumber).toBe(2);
  });

  it("uses the Perth date on the UTC side of midnight", () => {
    const context = buildPublicationContext(new Date("2026-08-09T16:01:00.000Z"));
    expect(context.editionDate).toBe("2026-08-10");
    expect(context.timeZone).toBe("Australia/Perth");
  });

  it("never emits an issue number below one and reports an exact 36-hour search window", () => {
    const now = new Date("2026-08-01T03:30:00.000Z");
    const context = buildPublicationContext(now);
    expect(context.issueNumber).toBe(1);
    expect(context.expectedArticleCount).toBe(8);
    // Today's window is never short of eight, so the daily sheet has no floor below it.
    expect(context.minimumArticleCount).toBe(8);
    expect(context.searchWindowEnd).toBe(now.toISOString());
    expect(EDITORIAL_WINDOW_HOURS).toBe(36);
    expect(Date.parse(context.searchWindowEnd) - Date.parse(context.searchWindowStart)).toBe(
      EDITORIAL_WINDOW_MS,
    );
    expect(buildEditorialWindow(now)).toEqual({
      searchWindowStart: context.searchWindowStart,
      searchWindowEnd: context.searchWindowEnd,
    });
  });
});

describe("buildKemarinPublicationContext", () => {
  it("prints today minus 35 years and keeps today's issue number", () => {
    const now = new Date("2026-08-08T23:00:00.000Z");
    const context = buildKemarinPublicationContext(now);
    expect(context.kind).toBe("kemarin");
    expect(context.publicationDate).toBe("2026-08-09");
    expect(context.editionDate).toBe("1991-08-09");
    expect(context.issueNumber).toBe(1);
    expect(context.offsetYears).toBe(KEMARIN_OFFSET_YEARS);
    expect(Date.parse(context.searchWindowEnd) - Date.parse(context.searchWindowStart)).toBe(
      EDITORIAL_WINDOW_MS,
    );
    expect(context.searchWindowEnd).toBe(shiftPerthInstantByYears(now, 35).toISOString());
    // Eight is still the target, but a thin archive may leave far fewer, and the
    // sheet prints what it has rather than holding the run.
    expect(context.expectedArticleCount).toBe(8);
    expect(context.minimumArticleCount).toBe(1);
  });

  it("clamps 29 February onto the last day of February 35 years earlier", () => {
    expect(historicalDateFromPublication("2028-02-29")).toBe("1993-02-28");
    const context = buildKemarinPublicationContext(new Date("2028-02-28T23:00:00.000Z"));
    expect(context.publicationDate).toBe("2028-02-29");
    expect(context.editionDate).toBe("1993-02-28");
  });
});
