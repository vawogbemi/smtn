// Generic HMAC-SHA256 signed-claims tokens: base64url(payload).base64url(sig).
// Shared by every "no session, just a link" flow in this codebase (customer
// tracking, customer profile) so the base64url/HMAC bytes-vs-text handling --
// verifying against the decoded payload bytes, not their base64url text, is
// the part that's easy to get wrong and was a real bug here once -- is
// written, and can be broken, in exactly one place.

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Imports a secret string as an HMAC-SHA256 key. Callers cache the result. */
export function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signClaims(key: CryptoKey, claims: unknown): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(claims));
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, payloadBytes),
  );
  return `${toBase64Url(payloadBytes)}.${toBase64Url(sigBytes)}`;
}

export class MalformedTokenError extends Error {}
export class InvalidTokenError extends Error {}

/**
 * Verifies the signature and returns the parsed claims. Callers still need to
 * check their own fields (expiry, which resource this is scoped to) -- this
 * only proves the claims weren't forged or edited, not that they still apply.
 */
export async function verifyClaims<T>(key: CryptoKey, token: string): Promise<T> {
  const [payloadPart, sigPart] = token.split(".");
  if (!payloadPart || !sigPart) {
    throw new MalformedTokenError("Malformed token");
  }

  let claims: T;
  try {
    claims = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payloadPart)),
    ) as T;
  } catch {
    throw new MalformedTokenError("Malformed token");
  }

  // Must verify against the same bytes that were signed at mint time -- the
  // decoded payload, not the base64url text of it -- or every token fails.
  // subtle.verify does a constant-time comparison internally; re-deriving
  // and string-comparing the signature ourselves would be timing-unsafe.
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    // .slice() rather than the raw Uint8Array: newer lib.dom typings want
    // BufferSource backed by a concrete ArrayBuffer, not ArrayBufferLike.
    fromBase64Url(sigPart).slice(),
    fromBase64Url(payloadPart).slice(),
  );
  if (!valid) throw new InvalidTokenError("Invalid token");

  return claims;
}
