// One-time InstantDB -> Durable Object migration.
//
//   INSTANT_DB_APP_ID=... INSTANT_DB_ADMIN_TOKEN=... MIGRATION_SECRET=... \
//     ORG=org_xxx TARGET=https://smtncargo.com node scripts/migrate-instant.mjs
//
// ORG is the Clerk organization id that should receive the data -- tenants are
// keyed by org, so there is no default to fall back to. Find it in the Clerk
// dashboard, or in the dashboard URL after signing in.
//
// Reads everything out of Instant, writes snapshot.json next to the repo for
// inspection, then POSTs it to /admin/migrate. The load is idempotent by
// primary key, so re-running after a partial failure is safe.
//
// Depends on @instantdb/admin, which is still installed -- run this BEFORE
// removing the Instant packages.

import { init } from "@instantdb/admin";
import { writeFile } from "node:fs/promises";

const appId = process.env.INSTANT_DB_APP_ID;
const adminToken = process.env.INSTANT_DB_ADMIN_TOKEN;
const secret = process.env.MIGRATION_SECRET;
const org = process.env.ORG;
const target = process.env.TARGET ?? "http://localhost:5173";

if (!appId || !adminToken || !secret || !org) {
  console.error(
    "Set INSTANT_DB_APP_ID, INSTANT_DB_ADMIN_TOKEN, MIGRATION_SECRET and ORG.",
  );
  process.exit(1);
}

const db = init({ appId, adminToken });

console.log("Reading from InstantDB...");
const data = await db.query({
  customers: {},
  shipments: {},
  orders: {
    customers: {},
    shipments: {},
    orderFrom: {},
    orderTo: {},
    packages: {},
  },
  messages: { customers: {} },
});

const snapshot = {
  customers: data.customers ?? [],
  shipments: data.shipments ?? [],
  orders: data.orders ?? [],
  messages: data.messages ?? [],
};

for (const [name, rows] of Object.entries(snapshot)) {
  console.log(`  ${name}: ${rows.length}`);
}

await writeFile("snapshot.json", JSON.stringify(snapshot, null, 2));
console.log("Wrote snapshot.json");

const url = `${target}/admin/migrate?org=${encodeURIComponent(org)}`;
console.log(`Loading into ${url} ...`);
const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-migration-secret": secret,
  },
  body: JSON.stringify(snapshot),
});

if (!response.ok) {
  console.error(`Failed (${response.status}):`, await response.text());
  process.exit(1);
}

console.log("Imported:", await response.json());
