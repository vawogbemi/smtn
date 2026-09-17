import { DurableObject } from "cloudflare:workers";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { eq } from "drizzle-orm";
import { numbers, orgs } from "./db/schema";
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
  readonly db: DrizzleSqliteDODatabase;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage);
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
    await this.db
      .insert(orgs)
      .values({ orgId, name, createdAt: Date.now() })
      .onConflictDoUpdate({ target: orgs.orgId, set: { name } });
  }

  async listOrgs(): Promise<OrgRow[]> {
    return (await this.db.select().from(orgs).orderBy(orgs.createdAt))
      .map((r) => ({ orgId: r.orgId, name: r.name, createdAt: r.createdAt }));
  }

  // A number routes to exactly one org. Claiming one already held by another
  // org fails loudly rather than silently redirecting somebody's customers.
  async claimNumber(phone: string, orgId: string): Promise<void> {
    const [held] = await this.db
      .select()
      .from(numbers)
      .where(eq(numbers.phone, phone))
      .limit(1);
    if (held && held.orgId !== orgId) {
      throw new Error(`${phone} is already claimed by another organization`);
    }
    await this.db.insert(numbers).values({ phone, orgId })
      .onConflictDoUpdate({ target: numbers.phone, set: { orgId } });
  }

  async orgForNumber(phone: string): Promise<string | null> {
    const [row] = await this.db
      .select()
      .from(numbers)
      .where(eq(numbers.phone, phone))
      .limit(1);
    return row?.orgId ?? null;
  }
}
