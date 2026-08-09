import { describe, expect, it } from "vitest";

import { editionInputSchema, editionPublishSchema, isLikelyDirectArticleUrl } from "../shared/edition";
import { validEditionPublish } from "./fixtures";

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
