import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAccessCookie,
  hasValidAccessCookie,
  verifyPublishSignature,
} from "../src/security";

afterEach(() => {
  vi.useRealTimers();
});

function signedRequest(body: string, secret: string, timestamp: number): Request {
  const timestampText = String(timestamp);
  const signature = createHmac("sha256", secret)
    .update(`${timestampText}.${body}`)
    .digest("base64url");
  return new Request("https://juara.example/api/editions", {
    method: "POST",
    headers: {
      "x-juara-timestamp": timestampText,
      "x-juara-signature": signature,
    },
    body,
  });
}

describe("publication signatures", () => {
  it("accepts an authentic, fresh edition payload", async () => {
    const secret = "redaksi-test-secret";
    const body = JSON.stringify({ editionDate: "2026-08-09" });
    const now = Date.parse("2026-08-09T00:00:00.000Z");
    const request = signedRequest(body, secret, now);

    await expect(verifyPublishSignature(request, body, secret, now)).resolves.toBe(true);
  });

  it("rejects a replay outside the five-minute publication window", async () => {
    const secret = "redaksi-test-secret";
    const body = "{}";
    const timestamp = Date.parse("2026-08-09T00:00:00.000Z");
    const request = signedRequest(body, secret, timestamp);

    await expect(
      verifyPublishSignature(request, body, secret, Date.parse("2026-08-09T00:06:00.000Z")),
    ).resolves.toBe(false);
  });

  it("rejects a timestamp too far in the future", async () => {
    const now = Date.parse("2026-08-09T00:00:00.000Z");
    const request = signedRequest("{}", "redaksi-test-secret", now + 5 * 60 * 1_000 + 1);
    await expect(
      verifyPublishSignature(request, "{}", "redaksi-test-secret", now),
    ).resolves.toBe(false);
  });

  it("rejects a body or signature that differs from the signed bytes", async () => {
    const now = Date.parse("2026-08-09T00:00:00.000Z");
    const request = signedRequest('{"issue":1}', "redaksi-test-secret", now);
    await expect(
      verifyPublishSignature(request, '{"issue":2}', "redaksi-test-secret", now),
    ).resolves.toBe(false);

    const malformed = new Request(request, {
      headers: {
        ...Object.fromEntries(request.headers),
        "x-juara-signature": "bukan-tanda-tangan",
      },
    });
    await expect(
      verifyPublishSignature(malformed, '{"issue":1}', "redaksi-test-secret", now),
    ).resolves.toBe(false);
  });

  it("rejects missing publication headers", async () => {
    const request = new Request("https://juara.example/api/editions", { method: "POST" });
    await expect(verifyPublishSignature(request, "", "redaksi-test-secret", 1)).resolves.toBe(
      false,
    );
  });
});

describe("reader access cookie", () => {
  it("round-trips an unmodified signed cookie", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T00:00:00.000Z"));
    const setCookie = await createAccessCookie("reader-test-secret", 600);
    const cookie = setCookie.slice(0, setCookie.indexOf(";"));
    const request = new Request("https://juara.example/", {
      headers: { cookie },
    });

    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    await expect(
      hasValidAccessCookie(request, "reader-test-secret", Date.now() + 599_000),
    ).resolves.toBe(true);
  });

  it("rejects a cookie whose signature has been altered", async () => {
    const setCookie = await createAccessCookie("reader-test-secret", 600);
    const cookie = setCookie.slice(0, setCookie.indexOf(";"));
    const request = new Request("https://juara.example/", {
      headers: { cookie: `${cookie}x` },
    });

    await expect(hasValidAccessCookie(request, "reader-test-secret")).resolves.toBe(false);
  });

  it("rejects missing, expired, malformed, and wrong-secret cookies", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T00:00:00.000Z"));
    const setCookie = await createAccessCookie("reader-test-secret", 10);
    const cookie = setCookie.slice(0, setCookie.indexOf(";"));
    const request = new Request("https://juara.example/", { headers: { cookie } });

    await expect(
      hasValidAccessCookie(new Request("https://juara.example/"), "reader-test-secret"),
    ).resolves.toBe(false);
    await expect(
      hasValidAccessCookie(request, "reader-test-secret", Date.now() + 10_001),
    ).resolves.toBe(false);
    await expect(hasValidAccessCookie(request, "wrong-secret")).resolves.toBe(false);
    await expect(
      hasValidAccessCookie(
        new Request("https://juara.example/", { headers: { cookie: "jm_access=one.two" } }),
        "reader-test-secret",
      ),
    ).resolves.toBe(false);
  });
});
