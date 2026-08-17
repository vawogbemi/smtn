import type { Env } from "../rpc";
import {
  hmacKey,
  signClaims,
  verifyClaims,
  MalformedTokenError,
} from "./signing";

// Signed, single-order tracking links -- how a customer reaches their
// shipment status with no account. The token carries everything needed to
// answer the request (which tenant, which order, how long it's valid) and is
// authenticated by HMAC, so it can't be forged or edited: changing orderId in
// a URL a customer already has breaks the signature rather than granting
// access to a different order. This is a signature over a claim, not a
// session -- there is no server-side revocation short of rotating the secret.

interface TrackingClaims {
  orgId: string;
  orderId: string;
  exp: number; // epoch ms
}

const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days: the life of a shipment

function key(env: Env): Promise<CryptoKey> {
  if (!env.TRACKING_LINK_SECRET) {
    throw new Error("TRACKING_LINK_SECRET is not configured");
  }
  return hmacKey(env.TRACKING_LINK_SECRET);
}

export async function mintTrackingToken(
  env: Env,
  orgId: string,
  orderId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<string> {
  const claims: TrackingClaims = { orgId, orderId, exp: Date.now() + ttlMs };
  return signClaims(await key(env), claims);
}

export class TrackingTokenError extends Error {}

/**
 * Verifies a token against the order it's being used on. The orderId check
 * is defense in depth on top of the signature: a token minted for one order
 * pasted into a different order's URL is rejected even before the HMAC
 * comparison would catch it.
 */
export async function verifyTrackingToken(
  env: Env,
  token: string,
  expectedOrderId: string,
): Promise<{ orgId: string; orderId: string }> {
  let claims: TrackingClaims;
  try {
    claims = await verifyClaims<TrackingClaims>(await key(env), token);
  } catch (e) {
    throw new TrackingTokenError(
      e instanceof MalformedTokenError
        ? "Malformed tracking link"
        : "Invalid tracking link",
    );
  }

  if (claims.orderId !== expectedOrderId) {
    throw new TrackingTokenError("This link does not match this order");
  }
  if (Date.now() > claims.exp) {
    throw new TrackingTokenError("This tracking link has expired");
  }

  return { orgId: claims.orgId, orderId: claims.orderId };
}
