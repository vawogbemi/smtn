import type { Env } from "./rpc";
import type { TenantDO } from "./tenant";
import type { RegistryDO } from "./registry";

// A tenant is addressed by its Clerk organization id. getByName is a stable
// hash, so the org id alone routes to the right object -- no lookup table for
// browser traffic, because the session already carries the answer.
//
// Deliberately the id, not the slug: ids are permanent, slugs are editable by
// an org admin in Clerk. Keying on a mutable value would mean a rename
// silently repoints getByName at a brand-new, empty object and strands
// everything under the old slug.
export function tenantFor(
  env: Env,
  orgId: string,
): DurableObjectStub<TenantDO> {
  if (!orgId) throw new Error("orgId is required to address a tenant");
  return env.TENANT.getByName(orgId);
}

// The one global object. Inbound SMS has no session, so the number it arrived
// on is the only clue to which tenant owns it -- that reverse lookup cannot
// live inside a tenant.
export function registry(env: Env): DurableObjectStub<RegistryDO> {
  return env.REGISTRY.getByName("global");
}

export async function tenantForNumber(
  env: Env,
  phone: string,
): Promise<{ orgId: string; tenant: DurableObjectStub<TenantDO> } | null> {
  const orgId = await registry(env).orgForNumber(phone);
  if (!orgId) return null;
  return { orgId, tenant: tenantFor(env, orgId) };
}
