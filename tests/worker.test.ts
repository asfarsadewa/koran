import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";
import { createAccessCookie } from "../src/security";
import { KEMARIN_PATH, SOCIAL_IMAGE_PATH } from "../src/social";
import { validEditionPublish, validKemarinPublish } from "./fixtures";

interface TestEnvOptions {
  assetsResponse?: Response;
  database?: D1Database;
  overrides?: Partial<Omit<Env, "ACCESS_TTL_SECONDS">> & { ACCESS_TTL_SECONDS?: string };
}

function createEnv(options: TestEnvOptions = {}) {
  const assetsFetch = vi.fn().mockResolvedValue(
    options.assetsResponse ??
      new Response("asset", { headers: { "content-type": "text/plain; charset=utf-8" } }),
  );
  const env = {
    DB: options.database ?? ({} as D1Database),
    ASSETS: { fetch: assetsFetch } as unknown as Fetcher,
    ACCESS_TTL_SECONDS: "43200",
    ENVIRONMENT: "production",
    TURNSTILE_SITE_KEY: "site-key-test",
    TURNSTILE_SECRET_KEY: "turnstile-secret-test",
    SESSION_SECRET: "session-secret-test",
    PUBLISH_SECRET: "publish-secret-test",
    ...options.overrides,
  } as unknown as Env;
  return { env, assetsFetch };
}

function publishDatabase() {
  const calls: { sql: string; args: unknown[] }[] = [];
  let batchSize = 0;
  const database = {
    prepare(sql: string) {
      const call = { sql, args: [] as unknown[] };
      calls.push(call);
      const statement = {
        bind(...args: unknown[]) {
          call.args = args;
          return statement;
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
    async batch(statements: D1PreparedStatement[]) {
      batchSize = statements.length;
      return [];
    },
  } as unknown as D1Database;
  return { database, calls, getBatchSize: () => batchSize };
}

function editionDatabase(): D1Database {
  return {
    prepare(sql: string) {
      const statement = {
        bind() {
          return statement;
        },
        async first<T>() {
          return {
            id: "2026-08-09",
            edition_date: "2026-08-09",
            issue_number: 1,
            masthead_dek: "Ikhtisar dunia pada hari ini.",
            published_at: "2026-08-09T01:00:00.000Z",
            curator_model: "gpt-5.6-sol",
            is_demo: 0,
          } as T;
        },
        async all<T>() {
          expect(sql).toContain("FROM articles");
          return { success: true, results: [], meta: {} } as unknown as D1Result<T>;
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

function articleImageDatabase(imageUrl: string | null): D1Database {
  return {
    prepare(sql: string) {
      expect(sql).toContain("FROM articles");
      const statement = {
        bind() {
          return statement;
        },
        async first<T>() {
          return (imageUrl ? { image_url: imageUrl } : { image_url: null }) as T;
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

function requestWithCookie(url: string, setCookie: string): Request {
  return new Request(url, {
    headers: { cookie: setCookie.slice(0, setCookie.indexOf(";")) },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Worker public and protected routes", () => {
  it("serves health and public configuration as no-store JSON", async () => {
    const { env } = createEnv();
    const health = await worker.fetch(new Request("https://koran.r3ptil.com/api/health"), env);
    const config = await worker.fetch(new Request("https://koran.r3ptil.com/api/config"), env);

    await expect(health.json()).resolves.toEqual({
      ok: true,
      service: "juara-merdeka",
      editionStore: "d1",
    });
    await expect(config.json()).resolves.toEqual({ siteKey: "site-key-test" });
    expect(health.headers.get("cache-control")).toBe("no-store");
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves the social banner without a reader cookie and makes it cacheable cross-origin", async () => {
    const { env, assetsFetch } = createEnv({
      assetsResponse: new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      }),
      overrides: { SESSION_SECRET: "" },
    });
    const response = await worker.fetch(
      new Request(`https://koran.r3ptil.com${SOCIAL_IMAGE_PATH}`),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(assetsFetch).toHaveBeenCalledOnce();
  });

  it("shows the metadata-bearing reader gate without exposing protected assets", async () => {
    const { env, assetsFetch } = createEnv({ overrides: { SESSION_SECRET: "" } });
    const response = await worker.fetch(new Request("https://koran.r3ptil.com/"), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Pemeriksaan Pembaca");
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it("forwards authorized HTML and applies private security headers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T00:00:00.000Z"));
    const setCookie = await createAccessCookie("session-secret-test", 600);
    const { env, assetsFetch } = createEnv({
      assetsResponse: new Response("<!doctype html><title>Juara Merdeka</title>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    });
    const response = await worker.fetch(
      requestWithCookie("https://koran.r3ptil.com/", setCookie),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(assetsFetch).toHaveBeenCalledOnce();
  });

  it("rewrites /kemarin to the newspaper shell after access", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T00:00:00.000Z"));
    const setCookie = await createAccessCookie("session-secret-test", 600);
    const { env, assetsFetch } = createEnv({
      assetsResponse: new Response("<!doctype html><title>Juara Merdeka</title>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    });
    const response = await worker.fetch(
      requestWithCookie("https://koran.r3ptil.com/kemarin", setCookie),
      env,
    );

    expect(response.status).toBe(200);
    const forwarded = assetsFetch.mock.calls[0]?.[0] as Request;
    expect(new URL(forwarded.url).pathname).toBe("/index.html");
  });

  it("shows Kemarin social metadata on the ungated /kemarin document", async () => {
    const { env, assetsFetch } = createEnv({ overrides: { SESSION_SECRET: "" } });
    const response = await worker.fetch(new Request("https://koran.r3ptil.com/kemarin"), env);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Lembar Kemarin");
    expect(html).toContain(`https://koran.r3ptil.com${KEMARIN_PATH}`);
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods before the asset binding", async () => {
    const { env, assetsFetch } = createEnv();
    const response = await worker.fetch(
      new Request("https://koran.r3ptil.com/not-an-api", { method: "PATCH" }),
      env,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it("requires a valid reader cookie before returning the current edition", async () => {
    const { env } = createEnv({ database: editionDatabase() });
    const denied = await worker.fetch(
      new Request("https://koran.r3ptil.com/api/edition"),
      env,
    );
    expect(denied.status).toBe(401);

    const setCookie = await createAccessCookie("session-secret-test", 600);
    const allowed = await worker.fetch(
      requestWithCookie("https://koran.r3ptil.com/api/edition", setCookie),
      env,
    );
    expect(allowed.status).toBe(200);
    await expect(allowed.json()).resolves.toMatchObject({
      ok: true,
      edition: { editionDate: "2026-08-09", isDemo: false },
    });
  });

  it("accepts a dated edition link and rejects malformed archive dates", async () => {
    const setCookie = await createAccessCookie("session-secret-test", 600);
    const { env } = createEnv({ database: editionDatabase() });
    const archived = await worker.fetch(
      requestWithCookie("https://koran.r3ptil.com/api/edition?edisi=2026-08-09", setCookie),
      env,
    );
    const malformed = await worker.fetch(
      requestWithCookie("https://koran.r3ptil.com/api/edition?edisi=kemarin", setCookie),
      env,
    );

    expect(archived.status).toBe(200);
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ error: "Tanggal edisi tidak sah." });

    const badKind = await worker.fetch(
      requestWithCookie("https://koran.r3ptil.com/api/edition?jenis=lusa", setCookie),
      env,
    );
    expect(badKind.status).toBe(400);
    await expect(badKind.json()).resolves.toMatchObject({ error: "Jenis lembar tidak sah." });
  });

  it("proxies only the stored article image for an authorized clipping", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          headers: { "content-type": "image/png", "content-length": "4" },
        }),
      ),
    );
    const setCookie = await createAccessCookie("session-secret-test", 600);
    const { env } = createEnv({
      database: articleImageDatabase("https://images.example.com/world/crisis-photo.png"),
    });
    const response = await worker.fetch(
      requestWithCookie(
        "https://koran.r3ptil.com/api/article-image?edisi=2026-08-11&berita=1",
        setCookie,
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://images.example.com/world/crisis-photo.png"),
      expect.objectContaining({ redirect: "follow" }),
    );
  });

  it("rejects malformed clipping image references before querying D1", async () => {
    const setCookie = await createAccessCookie("session-secret-test", 600);
    const { env } = createEnv({ database: {} as D1Database });
    const response = await worker.fetch(
      requestWithCookie(
        "https://koran.r3ptil.com/api/article-image?edisi=kemarin&berita=99",
        setCookie,
      ),
      env,
    );

    expect(response.status).toBe(400);
  });
});

describe("Worker Turnstile verification", () => {
  it("sets a signed access cookie after the expected production action", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, action: "turnstile-spin-v1" }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const { env } = createEnv({ overrides: { ACCESS_TTL_SECONDS: "1" } });
    const response = await worker.fetch(
      new Request("https://koran.r3ptil.com/api/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "192.0.2.10",
        },
        body: JSON.stringify({ token: "valid-turnstile-token" }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("jm_access=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=300");
  });

  it("rejects a mismatched action, absent token, and absent server secrets", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, action: "wrong-action" }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const { env } = createEnv();
    const wrongAction = await worker.fetch(
      new Request("https://koran.r3ptil.com/api/verify", {
        method: "POST",
        body: JSON.stringify({ token: "valid-turnstile-token" }),
      }),
      env,
    );
    const absentToken = await worker.fetch(
      new Request("https://koran.r3ptil.com/api/verify", { method: "POST", body: "{}" }),
      env,
    );
    const missingConfig = await worker.fetch(
      new Request("https://koran.r3ptil.com/api/verify", { method: "POST", body: "{}" }),
      createEnv({ overrides: { TURNSTILE_SECRET_KEY: "" } }).env,
    );

    expect(wrongAction.status).toBe(403);
    expect(absentToken.status).toBe(400);
    expect(missingConfig.status).toBe(503);
  });
});

describe("Worker publication boundary", () => {
  it("accepts a signed bilingual edition and commits both language versions atomically", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T02:03:04.000Z"));
    const fake = publishDatabase();
    const { env } = createEnv({ database: fake.database });
    const body = JSON.stringify(validEditionPublish());
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", "publish-secret-test")
      .update(`${timestamp}.${body}`)
      .digest("base64url");
    const response = await worker.fetch(
      new Request("https://koran.r3ptil.com/api/editions", {
        method: "POST",
        headers: {
          "x-juara-timestamp": timestamp,
          "x-juara-signature": signature,
        },
        body,
      }),
      env,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      editionId: "2026-08-09",
      articleCount: 8,
    });
    expect(fake.getBatchSize()).toBe(19);
    expect(fake.calls).toHaveLength(19);
  });

  it("accepts a signed Kemarin sheet and stores it separately from today's edition", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T02:03:04.000Z"));
    const fake = publishDatabase();
    const { env } = createEnv({ database: fake.database });
    const body = JSON.stringify(validKemarinPublish());
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", "publish-secret-test")
      .update(`${timestamp}.${body}`)
      .digest("base64url");
    const response = await worker.fetch(
      new Request("https://koran.r3ptil.com/api/editions", {
        method: "POST",
        headers: {
          "x-juara-timestamp": timestamp,
          "x-juara-signature": signature,
        },
        body,
      }),
      env,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      editionId: "kemarin-2026-08-09",
      articleCount: 8,
    });
    expect(fake.calls[0]?.args[0]).toBe("kemarin-2026-08-09");
    expect(fake.calls[0]?.args[1]).toBe("kemarin");
  });

  it("rejects a newly published edition without the complete Chinese version", async () => {
    const incomplete: Record<string, unknown> = { ...validEditionPublish() };
    delete incomplete.translations;
    const body = JSON.stringify(incomplete);
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", "publish-secret-test")
      .update(`${timestamp}.${body}`)
      .digest("base64url");
    const response = await worker.fetch(
      new Request("https://koran.r3ptil.com/api/editions", {
        method: "POST",
        headers: {
          "x-juara-timestamp": timestamp,
          "x-juara-signature": signature,
        },
        body,
      }),
      createEnv().env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Susunan edisi tidak sah.",
    });
  });

  it("rejects a bad signature and reports missing publication configuration", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const body = JSON.stringify(validEditionPublish());
    const invalid = await worker.fetch(
      new Request("https://koran.r3ptil.com/api/editions", {
        method: "POST",
        headers: {
          "x-juara-timestamp": String(Date.now()),
          "x-juara-signature": "invalid",
        },
        body,
      }),
      createEnv().env,
    );
    const missing = await worker.fetch(
      new Request("https://koran.r3ptil.com/api/editions", { method: "POST", body }),
      createEnv({ overrides: { PUBLISH_SECRET: "" } }).env,
    );

    expect(invalid.status).toBe(401);
    expect(missing.status).toBe(503);
  });
});
