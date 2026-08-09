const textEncoder = new TextEncoder();
const ACCESS_COOKIE = "jm_access";
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1_000;

function bytesToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return bytesToBase64Url(signature);
}

async function verifyHmac(secret: string, value: string, signature: string): Promise<boolean> {
  const signatureBytes = base64UrlToBytes(signature);
  if (!signatureBytes || signatureBytes.byteLength !== 32) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, signatureBytes, textEncoder.encode(value));
}

export async function verifyPublishSignature(
  request: Request,
  rawBody: string,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  const timestamp = request.headers.get("x-juara-timestamp") ?? "";
  const suppliedSignature = request.headers.get("x-juara-signature") ?? "";
  const timestampMs = Number(timestamp);

  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > SIGNATURE_TOLERANCE_MS) {
    return false;
  }

  return verifyHmac(secret, `${timestamp}.${rawBody}`, suppliedSignature);
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const pair of (header ?? "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 1) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (key) cookies.set(key, value);
  }
  return cookies;
}

export async function hasValidAccessCookie(
  request: Request,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  const token = parseCookies(request.headers.get("cookie")).get(ACCESS_COOKIE);
  if (!token) return false;

  const pieces = token.split(".");
  if (pieces.length !== 3) return false;
  const [expiresAt, nonce, suppliedSignature] = pieces;
  if (!expiresAt || !nonce || !suppliedSignature || nonce.length > 80) return false;

  const expiresAtMs = Number(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return false;

  return verifyHmac(secret, `${expiresAt}.${nonce}`, suppliedSignature);
}

export async function createAccessCookie(secret: string, ttlSeconds: number): Promise<string> {
  const expiresAt = Date.now() + ttlSeconds * 1_000;
  const nonce = crypto.randomUUID();
  const signature = await hmac(secret, `${expiresAt}.${nonce}`);
  const value = `${expiresAt}.${nonce}.${signature}`;

  return [
    `${ACCESS_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${ttlSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}
