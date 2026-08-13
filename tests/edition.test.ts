import { describe, expect, it } from "vitest";

import {
  editionInputSchema,
  editionPublishSchema,
  isLikelyDirectArticleUrl,
  isLikelyHistoricalSourceUrl,
  parseIsoDate,
  resolvedPublicationDate,
} from "../shared/edition";
import { validEditionPublish, validKemarinPublish } from "./fixtures";

function validEdition() {
  return editionInputSchema.parse(validEditionPublish());
}

describe("editionInputSchema", () => {
  it("accepts one complete eight-story edition", () => {
    expect(editionInputSchema.safeParse(validEdition()).success).toBe(true);
  });

  it("rejects duplicate source URLs", () => {
    const edition = validEdition();
    const first = edition.articles[0];
    const second = edition.articles[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    second.sourceUrl = first.sourceUrl;
    const parsed = editionInputSchema.safeParse(edition);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message.includes("distinct source URL"))).toBe(
        true,
      );
    }
  });

  it("rejects a missing rank", () => {
    const edition = validEdition();
    const last = edition.articles[7];
    expect(last).toBeDefined();
    if (!last) return;
    last.rank = 7;
    expect(editionInputSchema.safeParse(edition).success).toBe(false);
  });

  it("requires eight rank-matched Chinese articles containing Han characters", () => {
    const missingTranslation = validEdition();
    missingTranslation.translations.zhHans.articles.pop();
    expect(editionInputSchema.safeParse(missingTranslation).success).toBe(false);

    const copiedLatin = validEdition();
    const first = copiedLatin.translations.zhHans.articles[0];
    expect(first).toBeDefined();
    if (!first) return;
    first.headline = "Laporan berbahasa Indonesia tidak boleh mengisi edisi Tionghoa";
    expect(editionInputSchema.safeParse(copiedLatin).success).toBe(false);
  });

  it("rejects a section index in place of a direct source article", () => {
    const edition = validEdition();
    const first = edition.articles[0];
    expect(first).toBeDefined();
    if (!first) return;
    first.sourceUrl = "https://ukrinform.net/rubric-ato";
    expect(editionInputSchema.safeParse(edition).success).toBe(false);
  });

  it("rejects insecure source and image addresses", () => {
    const edition = validEdition();
    const first = edition.articles[0];
    expect(first).toBeDefined();
    if (!first) return;
    first.sourceUrl = "http://example.com/world/report-on-world-crisis-insecure";
    first.imageUrl = "http://images.example.com/world/photo.jpg";
    expect(editionInputSchema.safeParse(edition).success).toBe(false);
  });

  it("requires the declared curation model at the publication boundary", () => {
    expect(editionPublishSchema.safeParse(validEditionPublish()).success).toBe(true);
    expect(
      editionPublishSchema.safeParse({ ...validEditionPublish(), curatorModel: "gpt-4o" }).success,
    ).toBe(false);
  });
});

describe("kemarin editionInputSchema", () => {
  it("accepts a dated historical sheet with encyclopedia sources", () => {
    expect(editionInputSchema.safeParse(validKemarinPublish()).success).toBe(true);
  });

  it("rejects a Kemarin sheet without a Perth publication date", () => {
    const { publicationDate: _ignored, ...withoutPublicationDate } = validKemarinPublish();
    expect(editionInputSchema.safeParse(withoutPublicationDate).success).toBe(false);
  });

  it("rejects a Kemarin sheet whose printed date is not publication day minus 35 years", () => {
    const parsed = editionInputSchema.safeParse({
      ...validKemarinPublish(),
      editionDate: "1990-08-09",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects today's edition when the publication date does not match the printed date", () => {
    const parsed = editionInputSchema.safeParse({
      ...validEditionPublish(),
      publicationDate: "2026-08-10",
    });
    expect(parsed.success).toBe(false);
  });

  it("reports a date that cannot exist instead of throwing out of safeParse", () => {
    // 2026-02-31 satisfies the YYYY-MM-DD shape but is not a calendar day.
    const parsed = editionInputSchema.safeParse({
      ...validKemarinPublish(),
      publicationDate: "2026-02-31",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toContain("publicationDate");

    const printed = editionInputSchema.safeParse({
      ...validEditionPublish(),
      editionDate: "2026-02-30",
      publicationDate: "2026-02-30",
    });
    expect(printed.success).toBe(false);
  });
});

describe("resolvedPublicationDate", () => {
  it("falls back to the printed date for today's edition", () => {
    expect(resolvedPublicationDate("hari_ini", "2026-08-09")).toBe("2026-08-09");
    expect(resolvedPublicationDate("hari_ini", "2026-08-09", "2026-08-09")).toBe("2026-08-09");
  });

  it("refuses to build a Kemarin edition id from an absent publication date", () => {
    expect(() => resolvedPublicationDate("kemarin", "1991-08-09")).toThrow(
      "Kemarin editions require the Perth publication date",
    );
    expect(resolvedPublicationDate("kemarin", "1991-08-09", "2026-08-09")).toBe("2026-08-09");
  });
});

describe("isLikelyDirectArticleUrl", () => {
  it.each([
    "https://example.com/world/report-on-major-crisis",
    "https://example.com/2026/08/09/123456",
    "https://example.com/world/dispatch.html",
  ])("accepts direct article form %s", (url) => {
    expect(isLikelyDirectArticleUrl(url)).toBe(true);
  });

  it.each([
    "not a URL",
    "http://example.com/world/report-on-major-crisis",
    "https://example.com/",
    "https://example.com/world/news",
    "https://example.com/world/short",
  ])("rejects non-article form %s", (url) => {
    expect(isLikelyDirectArticleUrl(url)).toBe(false);
  });
});

describe("isLikelyHistoricalSourceUrl", () => {
  it.each([
    "https://en.wikipedia.org/wiki/Gulf_War",
    "https://en.wikipedia.org/wiki/1991_Soviet_coup_d%27%C3%A9tat_attempt",
    "https://www.britannica.com/topic/Soviet-Coup-of-1991",
    "https://www.nytimes.com/1991/08/19/world/report-on-moscow-coup.html",
    "https://web.archive.org/web/19910819120000/https://www.nytimes.com/1991/08/19/world/moscow-coup-report.html",
  ])("accepts historical source %s", (url) => {
    expect(isLikelyHistoricalSourceUrl(url)).toBe(true);
  });

  it.each([
    "https://en.wikipedia.org/wiki/Special:Search",
    "https://en.wikipedia.org/wiki/Main_Page",
    "https://www.britannica.com/",
    "http://en.wikipedia.org/wiki/Gulf_War",
  ])("rejects non-source %s", (url) => {
    expect(isLikelyHistoricalSourceUrl(url)).toBe(false);
  });

  it("rejects calendar dates that do not exist", () => {
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("not-a-date")).toBeNull();
  });
});
