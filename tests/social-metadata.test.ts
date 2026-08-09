import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { gateResponse } from "../src/gate";
import {
  SITE_URL,
  SOCIAL_DESCRIPTION,
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_URL,
  SOCIAL_TITLE,
} from "../src/social";

const root = resolve(import.meta.dirname, "..");

describe("social-sharing contract", () => {
  it("publishes complete Open Graph and large-card metadata in the static newspaper shell", async () => {
    const html = await readFile(resolve(root, "public/index.html"), "utf8");

    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}">`);
    expect(html).toContain(`content="${SOCIAL_TITLE}"`);
    expect(html).toContain(`content="${SOCIAL_DESCRIPTION}"`);
    expect(html).toContain(`content="${SOCIAL_IMAGE_URL}"`);
    expect(html).toContain(`content="${SOCIAL_IMAGE_ALT}"`);
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta property="og:locale" content="id_ID">');
    expect(html).toContain('<meta property="og:locale:alternate" content="zh_CN">');
  });

  it("places the same metadata on the pre-access Turnstile document", async () => {
    const response = gateResponse("site-key-test");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}">`);
    expect(html).toContain(`content="${SOCIAL_TITLE}"`);
    expect(html).toContain(`content="${SOCIAL_DESCRIPTION}"`);
    expect(html).toContain(`content="${SOCIAL_IMAGE_URL}"`);
    expect(html).toContain(`content="${SOCIAL_IMAGE_ALT}"`);
    expect(html).toContain('<meta property="og:locale:alternate" content="zh_CN">');
  });

  it("ships a valid 1200 by 630 PNG banner", async () => {
    const png = await readFile(resolve(root, "public/social/juara-merdeka-social.png"));

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.byteLength).toBeGreaterThan(100_000);
  });
});
