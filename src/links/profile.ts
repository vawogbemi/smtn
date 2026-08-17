import type { Env } from "../rpc";
import {
  hmacKey,
  signClaims,
  verifyClaims,
  MalformedTokenError,
} from "./signing";

// Signed customer-profile links -- how a customer with no account reaches a
// form to fill in their own profile (name, email, delivery address) after
// Dara or an operator texts them a link. Same shape as tracking.ts's tokens
// (a signature over a claim, not a session) but under its own secret, so a
// tracking link can never verify as a profile link or vice versa even though
// both are the same base64url(payload).base64url(sig) format.

interface ProfileClaims {
  orgId: string;
  customerId: string;
  exp: number; // epoch ms
}

const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days -- a form, not a shipment

function key(env: Env): Promise<CryptoKey> {
  if (!env.PROFILE_LINK_SECRET) {
    throw new Error("PROFILE_LINK_SECRET is not configured");
  }
  return hmacKey(env.PROFILE_LINK_SECRET);
}

export async function mintProfileToken(
  env: Env,
  orgId: string,
  customerId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<string> {
  const claims: ProfileClaims = { orgId, customerId, exp: Date.now() + ttlMs };
  return signClaims(await key(env), claims);
}

export class ProfileTokenError extends Error {}

/**
 * Verifies a token against the customer it's being used on. The customerId
 * check is defense in depth on top of the signature, same reasoning as
 * tracking.ts: a token minted for one customer pasted into a different
 * customer's URL is rejected even before the HMAC comparison would catch it.
 */
export async function verifyProfileToken(
  env: Env,
  token: string,
  expectedCustomerId: string,
): Promise<{ orgId: string; customerId: string }> {
  let claims: ProfileClaims;
  try {
    claims = await verifyClaims<ProfileClaims>(await key(env), token);
  } catch (e) {
    throw new ProfileTokenError(
      e instanceof MalformedTokenError
        ? "Malformed profile link"
        : "Invalid profile link",
    );
  }

  if (claims.customerId !== expectedCustomerId) {
    throw new ProfileTokenError("This link does not match this customer");
  }
  if (Date.now() > claims.exp) {
    throw new ProfileTokenError("This profile link has expired");
  }

  return { orgId: claims.orgId, customerId: claims.customerId };
}
