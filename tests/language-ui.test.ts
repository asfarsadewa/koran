import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHINESE_LOCALE,
  INDONESIAN_LOCALE,
  formatEditionDate,
  formatSourceDate,
  hasChineseEdition,
  mixLanguageText,
} from "../public/language.js";
import { shortKemarinPublish, validEditionPublish } from "./fixtures";

const root = resolve(import.meta.dirname, "..");

describe("newspaper language transformation", () => {
  it("creates a mixed-script intermediate state with exact endpoints", () => {
    const source = "JUARA MERDEKA";
    const target = "自由冠军报";

    expect(mixLanguageText(source, target, 0)).toBe(source);
    expect(mixLanguageText(source, target, 1)).toBe(target);
    const middle = mixLanguageText(source, target, 0.5);
    expect(middle).toMatch(/\p{Script=Han}/u);
    expect(middle).toMatch(/[A-Z]/u);
  });

  it("enables Chinese only when every printed story is translated", () => {
    const complete = validEditionPublish();
    expect(hasChineseEdition(complete)).toBe(true);

    const incomplete = structuredClone(complete);
    incomplete.translations.zhHans.articles.pop();
    expect(hasChineseEdition(incomplete)).toBe(false);
    expect(hasChineseEdition({ articles: [] })).toBe(false);
  });

  it("measures completeness against a short sheet's own length, not a fixed eight", () => {
    const short = shortKemarinPublish(3);
    expect(hasChineseEdition(short)).toBe(true);

    const partlyTranslated = structuredClone(short);
    partlyTranslated.translations.zhHans.articles.pop();
    expect(hasChineseEdition(partlyTranslated)).toBe(false);
  });

  it("formats edition and source dates for both language conventions", () => {
    expect(formatEditionDate("2026-08-09", INDONESIAN_LOCALE)).toMatch(/2026/u);
    expect(formatEditionDate("2026-08-09", CHINESE_LOCALE)).toMatch(/2026/u);
    expect(formatSourceDate("not-a-date", CHINESE_LOCALE)).toBe("not-a-date");
    expect(formatSourceDate("2026-08-09T00:00:00Z", INDONESIAN_LOCALE)).toMatch(/2026/u);
  });

  it("ships an accessible upper-right switch, module script, and reduced-motion treatment", async () => {
    const [html, css] = await Promise.all([
      readFile(resolve(root, "public/index.html"), "utf8"),
      readFile(resolve(root, "public/styles.css"), "utf8"),
    ]);

    expect(html).toContain('id="edition-switch"');
    expect(html).toContain('id="language-switch"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('data-copy-id="masthead-name"');
    expect(html).toContain('<script src="/app.js" type="module"></script>');
    expect(html).toContain('<meta property="og:locale:alternate" content="zh_CN">');
    expect(css).toContain('.masthead__tools');
    expect(css).toContain('.newsprint.is-language-shifting');
    expect(css).toContain('html[lang="zh-Hans"]');
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
