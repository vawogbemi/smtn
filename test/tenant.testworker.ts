// Test-only worker entry. The real entry (src/index.tsx) pulls in the Shippo
// SDK, which fails to load under the test transform for reasons unrelated to
// the Durable Object. Tests point `main` here so TenantDO is exercised on its
// own.
export { TenantDO } from "../src/tenant";
export { RegistryDO } from "../src/registry";

export default {
  fetch: () => new Response("test worker"),
};
