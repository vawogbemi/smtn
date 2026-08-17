import { verifyToken } from "@clerk/backend";
import type { Env } from "./rpc";

// The single place that answers "who is this request, and whose data may it
// touch?". Everything tenant-scoped goes through here, so gating the app is
// one function rather than a permission ruleset spread across the schema.

export interface Session {
  userId: string;
  // Addresses the tenant's Durable Object (env.TENANT.getByName). Deliberately
  // the permanent Clerk id, not the org's slug -- slugs are editable in
  // Clerk's org settings, and keying storage on a mutable value would mean a
  // rename silently repoints getByName at a brand-new, empty object.
  orgId: string;
  orgSlug: string | null;
  orgRole: string | null;
}

// Clerk v1 session tokens carry org_id/org_slug/org_role at the top level;
// v2 nests them under `o`. Both are read so a token version change doesn't
// silently drop everyone's organization.
function readOrg(claims: Record<string, any>) {
  const v2 = claims.o as
    | { id?: string; slg?: string; rol?: string }
    | undefined;
  return {
    orgId: (claims.org_id as string | undefined) ?? v2?.id ?? null,
    orgSlug: (claims.org_slug as string | undefined) ?? v2?.slg ?? null,
    orgRole: (claims.org_role as string | undefined) ?? v2?.rol ?? null,
  };
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 = 401,
  ) {
    super(message);
  }
}

/**
 * Verifies the bearer token and returns the caller's active organization.
 * Throws AuthError when there is no valid session, or a valid session with no
 * organization selected -- the latter is the state the onboarding flow exists
 * to resolve, so it is reported distinctly.
 */
export async function requireSession(
  request: Request,
  env: Env,
): Promise<Session> {
  if (!env.CLERK_SECRET_KEY) {
    throw new AuthError("Server is not configured for authentication", 401);
  }

  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    throw new AuthError("Missing session token");
  }

  let claims: Record<string, any>;
  try {
    claims = (await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      // Networkless verification when the PEM is configured; otherwise Clerk
      // fetches JWKS on demand and caches it.
      jwtKey: env.CLERK_JWT_KEY,
    })) as unknown as Record<string, any>;
  } catch (error) {
    throw new AuthError(
      `Invalid session token: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const userId = claims.sub as string | undefined;
  if (!userId) throw new AuthError("Session token has no subject");

  const { orgId, orgSlug, orgRole } = readOrg(claims);
  if (!orgId) {
    throw new AuthError("No active organization for this session", 403);
  }

  return { userId, orgId, orgSlug, orgRole };
}
