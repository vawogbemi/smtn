import { defineConfig } from "drizzle-kit";

// Durable Objects own separate SQLite databases. Migrations remain applied at
// object startup in TenantDO/RegistryDO so every existing object upgrades on
// wake. Keep those append-only migrations in sync with this schema before
// generating any Drizzle artifacts.
export default defineConfig({
  dialect: "sqlite",
  driver: "durable-sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
