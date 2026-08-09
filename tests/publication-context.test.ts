import { describe, expect, it } from "vitest";

import {
  buildEditorialWindow,
  buildPublicationContext,
  EDITORIAL_WINDOW_HOURS,
  EDITORIAL_WINDOW_MS,
} from "../agent/lib/publication-context";

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
