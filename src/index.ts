import { editionPublishSchema } from "../shared/edition";
import { publishEdition, readLatestEdition } from "./database";
import { gateResponse } from "./gate";
import { createAccessCookie, hasValidAccessCookie, verifyPublishSignature } from "./security";
import { SOCIAL_IMAGE_PATH } from "./social";

const MAX_JSON_BYTES = 128 * 1_024;

interface TurnstileResult {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
}

function json(payload: unknown, status = 200, additionalHeaders?: HeadersInit): Response {
  const headers = new Headers(additionalHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(payload), { status, headers });
}

async function readLimitedText(request: Request, limit = MAX_JSON_BYTES): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel("payload-too-large");
        throw new Error("payload-too-large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function clientIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip");
}

async function verifyTurnstile(request: Request, env: Env): Promise<Response> {
  if (!env.TURNSTILE_SECRET_KEY || !env.SESSION_SECRET) {
    console.error(JSON.stringify({ event: "turnstile.config_missing" }));
    return json({ ok: false, error: "Pemeriksaan pembaca belum dikonfigurasi." }, 503);
  }

  let rawBody: string;
  try {
    rawBody = await readLimitedText(request, 8_192);
  } catch {
    return json({ ok: false, error: "Permintaan terlalu besar." }, 413);
  }

  const body = parseJson(rawBody);
  const token =
    body && typeof body === "object" && "token" in body && typeof body.token === "string"
      ? body.token
      : "";
  if (!token || token.length > 4_096) {
    return json({ ok: false, error: "Tanda pemeriksaan tidak tersedia." }, 400);
  }

  const form = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  const ip = clientIp(request);
  if (ip) form.set("remoteip", ip);

  const cloudflareResponse = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
    },
  );
  let result: TurnstileResult = {};
  try {
    result = await cloudflareResponse.json<TurnstileResult>();
  } catch {
    result = {};
  }
  const actionMatches =
    env.ENVIRONMENT !== "production" || result.action === "turnstile-spin-v1";

  if (!result.success || !actionMatches) {
    console.warn(
      JSON.stringify({
        event: "turnstile.rejected",
        action: result.action ?? null,
        codes: result["error-codes"] ?? [],
      }),
    );
    return json({ ok: false, error: "Pemeriksaan pembaca tidak diterima." }, 403);
  }

  const configuredTtl = Number(env.ACCESS_TTL_SECONDS);
  const ttlSeconds = Number.isFinite(configuredTtl)
    ? Math.min(Math.max(Math.round(configuredTtl), 300), 86_400)
    : 43_200;
  const cookie = await createAccessCookie(env.SESSION_SECRET, ttlSeconds);
  return json({ ok: true }, 200, { "set-cookie": cookie });
}

async function handlePublish(request: Request, env: Env): Promise<Response> {
  if (!env.PUBLISH_SECRET) {
    console.error(JSON.stringify({ event: "publish.config_missing" }));
    return json({ ok: false, error: "Penerbitan belum dikonfigurasi." }, 503);
  }

  let rawBody: string;
  try {
    rawBody = await readLimitedText(request);
  } catch {
    return json({ ok: false, error: "Naskah melebihi batas penerbitan." }, 413);
  }

  if (!(await verifyPublishSignature(request, rawBody, env.PUBLISH_SECRET))) {
    return json({ ok: false, error: "Tanda tangan penerbitan tidak sah." }, 401);
  }

  const parsed = editionPublishSchema.safeParse(parseJson(rawBody));
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: "Susunan edisi tidak sah.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  const result = await publishEdition(env.DB, parsed.data);
  const receipt = crypto.randomUUID();
  console.log(
    JSON.stringify({
      event: "edition.published",
      editionId: result.editionId,
      articleCount: result.articleCount,
      receipt,
    }),
  );
  return json({ ok: true, ...result, receipt }, 201);
}

function hardenAssetResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  if (headers.get("content-type")?.includes("text/html")) {
    headers.set(
      "content-security-policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "font-src 'self'",
        "img-src 'self' https: data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "form-action 'none'",
      ].join("; "),
    );
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function publicSocialAssetResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
  headers.set("cross-origin-resource-policy", "cross-origin");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function hasAccess(request: Request, env: Env): Promise<boolean> {
  if (!env.SESSION_SECRET) return false;
  return hasValidAccessCookie(request, env.SESSION_SECRET);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "juara-merdeka", editionStore: "d1" });
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      return json({ siteKey: env.TURNSTILE_SITE_KEY });
    }

    if (url.pathname === "/api/verify" && request.method === "POST") {
      return verifyTurnstile(request, env);
    }

    if (url.pathname === "/api/editions" && request.method === "POST") {
      return handlePublish(request, env);
    }

    if (url.pathname === "/api/edition" && request.method === "GET") {
      if (!(await hasAccess(request, env))) {
        return json({ ok: false, error: "Pemeriksaan pembaca diperlukan." }, 401);
      }
      const edition = await readLatestEdition(env.DB);
      return edition
        ? json({ ok: true, edition })
        : json({ ok: false, error: "Edisi pertama sedang dihimpun." }, 404);
    }

    if (
      url.pathname === SOCIAL_IMAGE_PATH &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      return publicSocialAssetResponse(await env.ASSETS.fetch(request));
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ ok: false, error: "Cara permintaan tidak diizinkan." }, 405, {
        allow: "GET, HEAD",
      });
    }

    if (!(await hasAccess(request, env))) {
      return gateResponse(env.TURNSTILE_SITE_KEY);
    }

    return hardenAssetResponse(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;
