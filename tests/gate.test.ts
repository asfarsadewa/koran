import { describe, expect, it } from "vitest";

import { gateResponse } from "../src/gate";

describe("reader gate document", () => {
  it("uses one nonce consistently and permits only the Turnstile origin", async () => {
    const response = gateResponse("site-key-test");
    const html = await response.text();
    const policy = response.headers.get("content-security-policy") ?? "";
    const nonceMatch = policy.match(/script-src 'nonce-([a-f0-9]+)'/u);
    const nonce = nonceMatch?.[1];

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(nonce).toMatch(/^[a-f0-9]{32}$/u);
    expect(policy).toContain("https://challenges.cloudflare.com");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(html.match(new RegExp(`nonce="${nonce}"`, "gu"))).toHaveLength(3);
    expect(html).toContain("action: 'turnstile-spin-v1'");
    expect(html).toContain("sitekey: 'site-key-test'");
  });

  it("escapes a hostile site key before inserting it into HTML", async () => {
    const response = gateResponse(`key'><script>alert("x")</script>`);
    const html = await response.text();

    expect(html).not.toContain(`sitekey: 'key'><script>`);
    expect(html).toContain("key&#39;&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });
});
