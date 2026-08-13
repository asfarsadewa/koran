import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SHARE_SITE_URL,
  buildEditionShareUrl,
  buildStoryShareData,
  storyShareFileName,
} from "../public/share.js";

const root = resolve(import.meta.dirname, "..");

describe("story clipping sharing", () => {
  it("builds a durable Koran link to the exact edition and story", () => {
    expect(buildEditionShareUrl("2026-08-11", 1)).toBe(
      "https://koran.r3ptil.com/?edisi=2026-08-11#berita-1",
    );
    expect(buildEditionShareUrl("2026-08-11", 3, "zh-Hans")).toBe(
      "https://koran.r3ptil.com/?edisi=2026-08-11&bahasa=zh-Hans#berita-3",
    );
    expect(buildEditionShareUrl("2026-08-11", 1, "id", SHARE_SITE_URL, "kemarin")).toBe(
      "https://koran.r3ptil.com/kemarin?edisi=2026-08-11#berita-1",
    );
  });

  it("shares the Koran page rather than the publisher source", () => {
    const data = buildStoryShareData(
      "Gempa besar mengguncang wilayah barat Kolombia",
      "2026-08-11",
      1,
    );

    expect(SHARE_SITE_URL).toBe("https://koran.r3ptil.com/");
    expect(data.url).toBe("https://koran.r3ptil.com/?edisi=2026-08-11#berita-1");
    expect(data.text).toContain("Juara Merdeka");
    expect(data).not.toHaveProperty("sourceUrl");
    expect(storyShareFileName("2026-08-11", 1)).toBe(
      "juara-merdeka-2026-08-11-berita-1.png",
    );
  });

  it("ships an accessible, mobile-sized clipping control and status notice", async () => {
    const [html, app, css, share] = await Promise.all([
      readFile(resolve(root, "public/index.html"), "utf8"),
      readFile(resolve(root, "public/app.js"), "utf8"),
      readFile(resolve(root, "public/styles.css"), "utf8"),
      readFile(resolve(root, "public/share.js"), "utf8"),
    ]);

    expect(html).toContain('id="edition-switch"');
    expect(html).toContain('href="/kemarin"');
    expect(html).toContain('id="kemarin-notice"');
    expect(html).toContain('id="share-status"');
    expect(html).toContain('aria-live="polite"');
    expect(app).toContain('make("button", "story-share-button"');
    expect(app).toContain("navigator.canShare");
    expect(app).toContain("navigator.share");
    expect(app).toContain("navigator.userActivation");
    expect(app).toContain("IntersectionObserver");
    expect(app).toContain('new URL("/api/article-image"');
    expect(app).toContain('searchParams.set("jenis", KEMARIN_SHEET)');
    expect(css).toContain(".edition-switch");
    expect(css).toContain(".kemarin-notice");
    expect(css).toContain(".story-share-button");
    expect(css).toContain("min-height: 44px");
    expect(share).toContain("canvas.toBlob");
    expect(share).toContain("KORAN.R3PTIL.COM");
    expect(share).toContain("LEMBAR KEMARIN");
  });

  it("corrects the canonical address on the Kemarin sheet and keeps its copy in one table", async () => {
    const [html, app] = await Promise.all([
      readFile(resolve(root, "public/index.html"), "utf8"),
      readFile(resolve(root, "public/app.js"), "utf8"),
    ]);

    // The static document is served for both routes, so it still names the morning sheet.
    expect(html).toContain('<link rel="canonical" href="https://koran.r3ptil.com/">');
    expect(app).toContain('document.querySelector(\'link[rel="canonical"]\')');
    expect(app).toContain('document.querySelector(\'meta[property="og:url"]\')');
    expect(app).toContain('new URL("/kemarin", SHARE_SITE_URL)');

    // Both the pre-load and post-render paths read the same Kemarin copy table.
    expect(app.match(/POKOK BERITA KEMARIN/gu)).toHaveLength(1);
    expect(app.match(/function kemarinCopy\(/gu)).toHaveLength(1);
    expect(app.match(/kemarinCopy\(/gu)).toHaveLength(3);
  });
});
