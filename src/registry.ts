import { DurableObject } from "cloudflare:workers";
import type { Env } from "./rpc";

// A single object holding the tenant index. Everything else in the system is
// per-tenant by construction, but two questions can't be answered from inside
// a tenant: "which org owns the number this SMS arrived on?" and "what orgs
// exist?". Both are answered here.
//
// Deliberately tiny. It is a lookup table, not a second home for tenant data.

export interface OrgRow {
  orgId: string;
  name: string;
  createdAt: number;
}

export class RegistryDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.#migrate());
  }

  #migrate() {
    const sql = this.ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    const version = sql
      .exec<{ v: number }>("SELECT COALESCE(MAX(id), 0) AS v FROM _migrations")
      .one().v;

    if (version < 1) {
      sql.exec(`
        CREATE TABLE orgs (
          org_id     TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE numbers (
          phone  TEXT PRIMARY KEY,
          org_id TEXT NOT NULL
        );
        INSERT INTO _migrations (id) VALUES (1);
      `);
    }
  }

  async registerOrg(orgId: string, name: string): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT INTO orgs (org_id, name, created_at) VALUES (?, ?, ?)
       ON CONFLICT(org_id) DO UPDATE SET name = excluded.name`,
      orgId,
      name,
      Date.now(),
    );
  }

  async listOrgs(): Promise<OrgRow[]> {
    return this.ctx.storage.sql
      .exec<Record<string, any>>("SELECT * FROM orgs ORDER BY created_at")
      .toArray()
      .map((r) => ({ orgId: r.org_id, name: r.name, createdAt: r.created_at }));
  }

  // A number routes to exactly one org. Claiming one already held by another
  // org fails loudly rather than silently redirecting somebody's customers.
  async claimNumber(phone: string, orgId: string): Promise<void> {
    const held = this.ctx.storage.sql
      .exec<{ org_id: string }>(
        "SELECT org_id FROM numbers WHERE phone = ?",
        phone,
      )
      .toArray()[0];
    if (held && held.org_id !== orgId) {
      throw new Error(`${phone} is already claimed by another organization`);
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO numbers (phone, org_id) VALUES (?, ?)
       ON CONFLICT(phone) DO UPDATE SET org_id = excluded.org_id`,
      phone,
      orgId,
    );
  }

  async orgForNumber(phone: string): Promise<string | null> {
    const row = this.ctx.storage.sql
      .exec<{ org_id: string }>(
        "SELECT org_id FROM numbers WHERE phone = ?",
        phone,
      )
      .toArray()[0];
    return row?.org_id ?? null;
  }
}
