import { DurableObject } from "cloudflare:workers";
import {
  SessionManager,
  type SessionMessage,
} from "agents/experimental/memory/session";
import { createCompactFunction } from "agents/experimental/memory/utils";
import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";
import type { Env } from "./rpc";

// One Durable Object per freight forwarder. Tenancy is structural: a tenant's
// rows live in its own SQLite database, so there is no org_id filter for a
// query -- or for Dara's generated code -- to forget.

export type EventStatus = "ok" | "failed" | "needs_review";

export interface EventInput {
  type: string;
  actor: "dara" | "operator" | "customer" | "system";
  summary: string;
  payload?: unknown;
  status?: EventStatus;
  customerId?: string | null;
  orderId?: string | null;
  shipmentId?: string | null;
}

export type MessageActor = "dara" | "operator" | "customer";
export type MessageChannel = "sms" | "whatsapp";

export interface MessageInput {
  id: string;
  sid?: string | null;
  customerId?: string | null;
  direction: "inbound" | "outbound";
  body: string;
  from: string;
  to: string;
  // Who actually sent it, distinct from direction: an outbound message can be
  // Dara's auto-reply or an operator typing directly into the thread. Inbound
  // is always the customer, but callers pass it explicitly rather than have
  // this module infer it from direction.
  actor: MessageActor;
  channel?: MessageChannel;
}

// Views are shaped like the nested objects the UI already consumes, so the
// components keep reading order.customers?.name rather than a flat join row.
export interface CustomerView {
  id: string;
  name: string | null;
  phone: string | null;
}

export interface PackageView {
  id: string;
  number: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
}

export interface PlaceView {
  description: string | null;
  placeId: string | null;
}

export interface OrderView {
  id: string;
  createdAt: number | null;
  amountTotal: number | null;
  amountPaid: number | null;
  clearance: string | null;
  customers: CustomerView | null;
  orderFrom: PlaceView | null;
  orderTo: PlaceView | null;
  packages: PackageView[];
  shipments: { id: string; title: string } | null;
}

export interface ShipmentView {
  id: string;
  title: string;
  status: string;
  createdAt: number | null;
  orders: OrderView[];
}

export interface MessageView {
  id: string;
  body: string;
  direction: string;
  actor: MessageActor | null;
  channel: MessageChannel;
  from: string | null;
  to: string | null;
  createdAt: number | null;
  customers: CustomerView | null;
}

export interface CustomerProfileView {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: PlaceView | null;
  onboardedAt: number | null;
}

export interface TenantSettings {
  orgId: string;
  name: string;
  twilioNumber: string | null;
  origin: PlaceView | null;
  destination: PlaceView | null;
  markup: number;
  createdAt: number;
}

export interface ImportInput {
  shipmentId: string;
  fileName?: string | null;
  defaultTitle?: string | null;
  from: PlaceView;
  to: PlaceView;
  packages: {
    number?: string | null;
    name?: string | null;
    phone?: string | null;
    weight?: number | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
  }[];
}

// Tables and columns Dara may write, keeping $files, messages, and events off
// limits. Both table and column names are interpolated into SQL, so nothing
// outside this map is ever allowed through.
const WRITABLE: Record<string, string[]> = {
  customers: ["name", "phone"],
  shipments: ["title", "status", "departs_at", "arrives_at"],
  orders: [
    "customer_id",
    "shipment_id",
    "to_place",
    "to_place_id",
    "from_place",
    "from_place_id",
    "amount_total",
    "amount_paid",
    "clearance",
  ],
  packages: ["order_id", "number", "weight", "length", "width", "height"],
};

export interface WriteOp {
  table: string;
  id: string;
  data: Record<string, unknown>;
}

// Validates one write op and returns the columns to apply. Table and column
// names reach SQL by interpolation, so nothing outside WRITABLE gets through.
export function assertWritableOp(op: WriteOp): string[] {
  const allowed = WRITABLE[op.table];
  if (!allowed) {
    throw new Error(`Cannot write to "${op.table}"`);
  }
  if (typeof op.id !== "string" || !op.id) {
    throw new Error(`Write to "${op.table}" is missing an id`);
  }
  const columns = Object.keys(op.data ?? {});
  const rejected = columns.filter((c) => !allowed.includes(c));
  if (rejected.length > 0) {
    throw new Error(
      `Unknown column(s) on ${op.table}: ${rejected.join(", ")}. Allowed: ${allowed.join(", ")}`,
    );
  }
  return columns;
}

// Dara writes the queries it runs, so they are validated before execution.
// Returns the comment-stripped query to execute; throws if it isn't a single
// read-only statement.
export function assertReadOnlyQuery(query: string): string {
  const stripped = query
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim();
  if (!/^(select|with)\b/i.test(stripped)) {
    throw new Error("query must be a single read-only SELECT");
  }
  // sql.exec runs multiple statements when separated by semicolons, so a stray
  // one would smuggle in a write. This also rejects semicolons inside string
  // literals; that tradeoff is deliberate.
  if (stripped.includes(";")) {
    throw new Error("query must be a single statement (no semicolons)");
  }
  return stripped;
}

// The RPC-facing shape of a session message -- narrower than the SDK's own
// SessionMessage/SessionMessagePart (which carry `unknown`-typed tool-call
// fields for input/output/result, and an optional Date). Those don't survive
// the DurableObjectStub RPC boundary's structured-clone type checking
// (Rpc.Serializable collapses `unknown` properties, which poisons the whole
// array's inferred type to `never` for any caller across a stub). Callers
// here only ever write plain text turns, so this is what actually gets
// produced, not a lossy workaround.
export interface SessionMessageView {
  id: string;
  role: string;
  parts: { type: string; text?: string }[];
}

// Summarization is plain text-completion, not tool-calling, so it isn't
// bound by agent/codemode.tsx's MODEL constraint (qwen2.5-coder's lack of
// real function-calling). Reuses the same model for now anyway, one fewer
// model to reason about -- swapping to something cheaper later touches only
// this constant. Duplicated rather than imported to keep tenant.ts free of
// a dependency on agent/, same call as SESSION_BODY_CHARS below.
const SUMMARY_MODEL = "@cf/zai-org/glm-4.7-flash";

// getSessionHistory's byte budget already covers a normal-length thread --
// compaction only matters once a relationship has grown well past that.
// Deliberately generous first cut, tunable.
const COMPACT_TOKEN_THRESHOLD = 20_000;

// How much of the tail createCompactFunction protects from summarization --
// deliberately well below COMPACT_TOKEN_THRESHOLD; see the comment at its
// call site in #sessions().
const COMPACT_TAIL_TOKEN_BUDGET = 4_000;

async function summarizeForCompaction(env: Env, prompt: string): Promise<string> {
  const workersai = createWorkersAI({ binding: env.AI });
  const result = await generateText({
    model: workersai(SUMMARY_MODEL as Parameters<typeof workersai>[0]),
    prompt,
  });
  return result.text;
}

const SESSION_BODY_CHARS = 1000; // mirrors agent/history.ts's MAX_BODY_CHARS

// Shapes a stored message for Dara's conversation memory (the Agents SDK
// Session API), kept separate from the messages table row it's derived
// from -- that row is the operator-facing, multi-channel record (sid,
// from/to, actor, channel); this is just what the model should read.
// Only operator replies need a marker -- Dara's own voice is the implicit
// default for "assistant", and this is the exact distinction the
// actor-labeling fix depended on: an operator's manual reply must not read
// back to Dara as its own words.
function toSessionMessage(m: MessageInput): SessionMessage {
  const role = m.actor === "customer" ? "user" : "assistant";
  const text = m.actor === "operator" ? `[Operator] ${m.body}` : m.body;
  return {
    id: m.id,
    role,
    parts: [{ type: "text", text: text.slice(0, SESSION_BODY_CHARS) }],
  };
}

export class TenantDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Migrations run once per object, on wake, before any request is served.
    ctx.blockConcurrencyWhile(async () => this.#migrate());
  }

  // SqlProvider conformance for the Agents SDK's Session API (AgentSessionProvider
  // below): the same tagged-template shape the SDK's own Agent class exposes as
  // `this.sql`, wrapping the same underlying storage.sql.exec this file already
  // uses everywhere else.
  sql<T = Record<string, string | number | boolean | null>>(
    strings: TemplateStringsArray,
    ...values: (string | number | boolean | null)[]
  ): T[] {
    const query = strings.reduce(
      (acc, s, i) => acc + s + (i < values.length ? "?" : ""),
      "",
    );
    // storage.sql.exec's own generic requires T to extend its
    // SqlStorageValue record shape; SqlProvider's T is unconstrained, so the
    // cast (not a generic parameter here) is the boundary between the two.
    return this.ctx.storage.sql.exec(query, ...values).toArray() as T[];
  }

  // Message storage, a per-customer "memory" scratchpad (auto-namespaced per
  // session id by SessionManager), and auto-compaction once a thread's
  // history grows past COMPACT_TOKEN_THRESHOLD -- summarizing the older
  // middle section with a cheap LLM call instead of letting
  // getSessionHistory's byte budget silently drop it. getSession(customerId)
  // on the result returns the fully configured, customer-scoped Session.
  #sessions(): SessionManager {
    return SessionManager.create(this)
      .withContext("memory", {
        description:
          "Short notes about this customer worth remembering across " +
          "conversations (preferences, sensitivities, ongoing issues).",
        maxTokens: 500,
      })
      .onCompaction(
        createCompactFunction({
          summarize: (prompt) => summarizeForCompaction(this.env, prompt),
          // Must be meaningfully smaller than COMPACT_TOKEN_THRESHOLD, or
          // there's no real "middle" section left to summarize once the
          // trigger fires -- createCompactFunction's own default (20k, same
          // order of magnitude as the trigger) protects the whole history as
          // "tail" and always no-ops. Roughly matches getSessionHistory's
          // read-window default (6000 bytes) in token terms.
          tailTokenBudget: COMPACT_TAIL_TOKEN_BUDGET,
        }),
      )
      .onCompactionError((error) =>
        console.error("Dara conversation compaction failed:", error),
      )
      .compactAfter(COMPACT_TOKEN_THRESHOLD);
  }

  // PRAGMA user_version is not supported in Durable Object SQLite, so schema
  // version lives in a table. Each block is append-only: never edit a shipped
  // migration, add the next id instead.
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
        CREATE TABLE customers (
          id         TEXT PRIMARY KEY,
          name       TEXT,
          phone      TEXT UNIQUE,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE shipments (
          id         TEXT PRIMARY KEY,
          title      TEXT NOT NULL,
          status     TEXT NOT NULL DEFAULT 'open',
          departs_at INTEGER,
          arrives_at INTEGER,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE orders (
          id            TEXT PRIMARY KEY,
          customer_id   TEXT REFERENCES customers(id),
          shipment_id   TEXT REFERENCES shipments(id),
          to_place      TEXT,
          to_place_id   TEXT,
          from_place    TEXT,
          from_place_id TEXT,
          amount_total  INTEGER,
          amount_paid   INTEGER NOT NULL DEFAULT 0,
          clearance     TEXT,
          created_at    INTEGER NOT NULL
        );

        CREATE TABLE packages (
          id       TEXT PRIMARY KEY,
          order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          number   TEXT,
          weight   REAL,
          length   REAL,
          width    REAL,
          height   REAL
        );

        CREATE TABLE messages (
          id          TEXT PRIMARY KEY,
          customer_id TEXT REFERENCES customers(id),
          sid         TEXT UNIQUE,
          direction   TEXT NOT NULL,
          body        TEXT NOT NULL,
          from_addr   TEXT,
          to_addr     TEXT,
          created_at  INTEGER NOT NULL
        );

        CREATE TABLE events (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          type        TEXT NOT NULL,
          actor       TEXT NOT NULL,
          summary     TEXT NOT NULL,
          payload     TEXT,
          status      TEXT NOT NULL DEFAULT 'ok',
          customer_id TEXT,
          order_id    TEXT,
          shipment_id TEXT,
          handled_at  INTEGER,
          created_at  INTEGER NOT NULL
        );

        CREATE INDEX idx_events_open     ON events(handled_at, created_at DESC);
        CREATE INDEX idx_msgs_customer   ON messages(customer_id, created_at);
        CREATE INDEX idx_orders_shipment ON orders(shipment_id);
        CREATE INDEX idx_packages_order  ON packages(order_id);

        INSERT INTO _migrations (id) VALUES (1);
      `);
    }

    if (version < 2) {
      // Single row, enforced by the CHECK: this object is one tenant, so its
      // identity and configuration are not a collection.
      sql.exec(`
        CREATE TABLE tenant (
          id                INTEGER PRIMARY KEY CHECK (id = 1),
          org_id            TEXT NOT NULL,
          name              TEXT NOT NULL,
          twilio_number     TEXT,
          origin            TEXT,
          origin_place_id   TEXT,
          destination       TEXT,
          destination_place_id TEXT,
          markup            REAL NOT NULL DEFAULT 1.3,
          created_at        INTEGER NOT NULL
        );
        INSERT INTO _migrations (id) VALUES (2);
      `);
    }

    if (version < 3) {
      // actor distinguishes an automated reply from a human one on the same
      // "outbound" direction -- without it, a chat thread can't tell Dara's
      // messages from an operator's without joining against events. channel
      // exists for the day a second channel (WhatsApp) lands; defaulting
      // every existing row to 'sms' costs nothing now and avoids a judgment
      // call on historical data later.
      sql.exec(`
        ALTER TABLE messages ADD COLUMN actor TEXT;
        ALTER TABLE messages ADD COLUMN channel TEXT NOT NULL DEFAULT 'sms';
        INSERT INTO _migrations (id) VALUES (3);
      `);
    }

    if (version < 4) {
      // The customer profile form's fields. address is stored the same way as
      // orders.to_place/from_place -- a free-text description plus the Places
      // id, not a normalized address -- so it round-trips through the same
      // PlaceView shape and autocomplete the rest of the app already uses.
      // onboarded_at is null until the form is actually submitted once, so a
      // row upserted from an inbound SMS reads as "not onboarded" rather than
      // as a customer who filled in nothing.
      sql.exec(`
        ALTER TABLE customers ADD COLUMN email TEXT;
        ALTER TABLE customers ADD COLUMN address TEXT;
        ALTER TABLE customers ADD COLUMN address_place_id TEXT;
        ALTER TABLE customers ADD COLUMN onboarded_at INTEGER;
        INSERT INTO _migrations (id) VALUES (4);
      `);
    }
  }

  // -- identity and settings -----------------------------------------------

  // Called on every dashboard load, so it must be idempotent: the first call
  // provisions the tenant, later ones just read it back. A Durable Object is
  // created by being addressed, so this is what makes it a *configured*
  // tenant rather than an empty database that happens to exist.
  async ensureInitialized(
    orgId: string,
    name: string,
  ): Promise<TenantSettings> {
    if (!orgId) throw new Error("orgId is required");
    this.ctx.storage.sql.exec(
      `INSERT INTO tenant (id, org_id, name, created_at) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
      orgId,
      name || "Untitled",
      Date.now(),
    );
    return this.settings();
  }

  async settings(): Promise<TenantSettings> {
    const rows = this.ctx.storage.sql
      .exec<Record<string, any>>("SELECT * FROM tenant WHERE id = 1")
      .toArray();
    const row = rows[0];
    if (!row) throw new Error("Tenant has not been initialized");
    return {
      orgId: row.org_id,
      name: row.name,
      twilioNumber: row.twilio_number,
      origin: row.origin
        ? { description: row.origin, placeId: row.origin_place_id }
        : null,
      destination: row.destination
        ? { description: row.destination, placeId: row.destination_place_id }
        : null,
      markup: row.markup,
      createdAt: row.created_at,
    };
  }

  async updateSettings(patch: {
    name?: string;
    twilioNumber?: string | null;
    origin?: PlaceView | null;
    destination?: PlaceView | null;
    markup?: number;
  }): Promise<TenantSettings> {
    const sql = this.ctx.storage.sql;
    if (patch.name !== undefined) {
      sql.exec("UPDATE tenant SET name = ? WHERE id = 1", patch.name);
    }
    if (patch.twilioNumber !== undefined) {
      sql.exec(
        "UPDATE tenant SET twilio_number = ? WHERE id = 1",
        patch.twilioNumber,
      );
    }
    if (patch.origin !== undefined) {
      sql.exec(
        "UPDATE tenant SET origin = ?, origin_place_id = ? WHERE id = 1",
        patch.origin?.description ?? null,
        patch.origin?.placeId ?? null,
      );
    }
    if (patch.destination !== undefined) {
      sql.exec(
        "UPDATE tenant SET destination = ?, destination_place_id = ? WHERE id = 1",
        patch.destination?.description ?? null,
        patch.destination?.placeId ?? null,
      );
    }
    if (patch.markup !== undefined) {
      sql.exec("UPDATE tenant SET markup = ? WHERE id = 1", patch.markup);
    }
    this.#broadcast({ type: "invalidate", scope: "settings" });
    return this.settings();
  }

  // -- reads ---------------------------------------------------------------

  // The operator inbox: unhandled events, newest first. Exceptions sort above
  // routine activity so a backlog of "Dara handled it" never buries a failure.
  async inbox(limit = 50) {
    return this.ctx.storage.sql
      .exec(
        `SELECT e.*, c.name AS customer_name, c.phone AS customer_phone
         FROM events e
         LEFT JOIN customers c ON c.id = e.customer_id
         WHERE e.handled_at IS NULL
         ORDER BY (e.status = 'ok') ASC, e.created_at DESC
         LIMIT ?`,
        limit,
      )
      .toArray();
  }

  // Oldest-first, the order a chat thread renders in. This is the real
  // per-customer conversation: the unit SMS actually threads by, unlike
  // per-order state, which fragments one customer's history across however
  // many orders they have.
  async thread(customerId: string, limit = 50): Promise<MessageView[]> {
    const rows = this.ctx.storage.sql
      .exec<Record<string, any>>(
        `SELECT * FROM messages
         WHERE customer_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        customerId,
        limit,
      )
      .toArray()
      .reverse();
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      direction: r.direction,
      actor: r.actor,
      channel: r.channel,
      from: r.from_addr,
      to: r.to_addr,
      createdAt: r.created_at,
      customers: null, // caller already knows which customer they asked for
    }));
  }

  // Assembles the nested order shape from a join plus one packages lookup.
  // Both cursors are drained synchronously -- a cursor held across an await
  // can observe uncommitted rows.
  #orders(where: string, ...params: unknown[]): OrderView[] {
    const rows = this.ctx.storage.sql
      .exec<Record<string, any>>(
        `SELECT o.id, o.created_at, o.amount_total, o.amount_paid, o.clearance,
                o.to_place, o.to_place_id, o.from_place, o.from_place_id,
                c.id AS c_id, c.name AS c_name, c.phone AS c_phone,
                s.id AS s_id, s.title AS s_title
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN shipments s ON s.id = o.shipment_id
         ${where}`,
        ...params,
      )
      .toArray();
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id as string);
    const packages = this.ctx.storage.sql
      .exec<Record<string, any>>(
        `SELECT * FROM packages WHERE order_id IN (${ids.map(() => "?").join(",")})`,
        ...ids,
      )
      .toArray();

    const byOrder = new Map<string, PackageView[]>();
    for (const p of packages) {
      const list = byOrder.get(p.order_id) ?? [];
      list.push({
        id: p.id,
        number: p.number,
        weight: p.weight,
        length: p.length,
        width: p.width,
        height: p.height,
      });
      byOrder.set(p.order_id, list);
    }

    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      amountTotal: r.amount_total,
      amountPaid: r.amount_paid,
      clearance: r.clearance,
      customers: r.c_id
        ? { id: r.c_id, name: r.c_name, phone: r.c_phone }
        : null,
      orderFrom: r.from_place
        ? { description: r.from_place, placeId: r.from_place_id }
        : null,
      orderTo: r.to_place
        ? { description: r.to_place, placeId: r.to_place_id }
        : null,
      packages: byOrder.get(r.id) ?? [],
      shipments: r.s_id ? { id: r.s_id, title: r.s_title } : null,
    }));
  }

  async listOrders(): Promise<OrderView[]> {
    return this.#orders("ORDER BY o.created_at DESC");
  }

  async ordersByIds(ids: string[]): Promise<OrderView[]> {
    if (ids.length === 0) return [];
    return this.#orders(
      `WHERE o.id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
  }

  async listShipments(): Promise<ShipmentView[]> {
    const rows = this.ctx.storage.sql
      .exec<Record<string, any>>(
        "SELECT * FROM shipments ORDER BY created_at DESC",
      )
      .toArray();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.created_at,
      orders: [],
    }));
  }

  async getShipment(shipmentId: string): Promise<ShipmentView | null> {
    const rows = this.ctx.storage.sql
      .exec<Record<string, any>>(
        "SELECT * FROM shipments WHERE id = ?",
        shipmentId,
      )
      .toArray();
    const shipment = rows[0];
    if (!shipment) return null;
    return {
      id: shipment.id,
      title: shipment.title,
      status: shipment.status,
      createdAt: shipment.created_at,
      orders: this.#orders(
        "WHERE o.shipment_id = ? ORDER BY o.created_at DESC",
        shipmentId,
      ),
    };
  }

  async getCustomerProfile(customerId: string): Promise<CustomerProfileView | null> {
    const rows = this.ctx.storage.sql
      .exec<Record<string, any>>(
        "SELECT * FROM customers WHERE id = ?",
        customerId,
      )
      .toArray();
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address
        ? { description: row.address, placeId: row.address_place_id }
        : null,
      onboardedAt: row.onboarded_at,
    };
  }

  async listMessages(limit = 200): Promise<MessageView[]> {
    const rows = this.ctx.storage.sql
      .exec<Record<string, any>>(
        `SELECT m.*, c.id AS c_id, c.name AS c_name, c.phone AS c_phone
         FROM messages m
         LEFT JOIN customers c ON c.id = m.customer_id
         ORDER BY m.created_at DESC
         LIMIT ?`,
        limit,
      )
      .toArray();
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      direction: r.direction,
      actor: r.actor,
      channel: r.channel,
      from: r.from_addr,
      to: r.to_addr,
      createdAt: r.created_at,
      customers: r.c_id
        ? { id: r.c_id, name: r.c_name, phone: r.c_phone }
        : null,
    }));
  }

  async createShipment(title: string): Promise<string> {
    const shipmentId = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      "INSERT INTO shipments (id, title, created_at) VALUES (?, ?, ?)",
      shipmentId,
      title,
      Date.now(),
    );
    this.#broadcast({ type: "invalidate", scope: "shipments" });
    return shipmentId;
  }

  async updateShipmentTitle(shipmentId: string, title: string) {
    this.ctx.storage.sql.exec(
      "UPDATE shipments SET title = ? WHERE id = ?",
      title,
      shipmentId,
    );
    this.#broadcast({ type: "invalidate", scope: "shipments" });
  }

  // Replaces the multi-entity Instant transaction. Every statement runs with
  // no await between them, so the whole import commits atomically -- an order
  // can never land without its packages.
  async importPackages(input: ImportInput): Promise<{ created: number }> {
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    let created = 0;

    for (const pkg of input.packages) {
      const phone = pkg.phone?.trim();
      let customerId: string | null = null;
      if (phone) {
        const found = sql
          .exec<{ id: string }>("SELECT id FROM customers WHERE phone = ?", phone)
          .toArray();
        customerId = found[0]?.id ?? null;
        if (customerId) {
          if (pkg.name) {
            sql.exec(
              "UPDATE customers SET name = COALESCE(name, ?) WHERE id = ?",
              pkg.name,
              customerId,
            );
          }
        } else {
          customerId = crypto.randomUUID();
          sql.exec(
            "INSERT INTO customers (id, name, phone, created_at) VALUES (?, ?, ?, ?)",
            customerId,
            pkg.name ?? null,
            phone,
            now,
          );
        }
      }

      const orderId = crypto.randomUUID();
      sql.exec(
        `INSERT INTO orders
           (id, customer_id, shipment_id, to_place, to_place_id, from_place, from_place_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        orderId,
        customerId,
        input.shipmentId,
        input.to.description,
        input.to.placeId,
        input.from.description,
        input.from.placeId,
        now,
      );
      sql.exec(
        `INSERT INTO packages (id, order_id, number, weight, length, width, height)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        orderId,
        pkg.number ?? null,
        pkg.weight ?? null,
        pkg.length ?? null,
        pkg.width ?? null,
        pkg.height ?? null,
      );
      created++;
    }

    // An untouched shipment takes its name from the manifest it was filled from.
    if (input.fileName && input.defaultTitle) {
      sql.exec(
        "UPDATE shipments SET title = ? WHERE id = ? AND title = ?",
        input.fileName,
        input.shipmentId,
        input.defaultTitle,
      );
    }

    this.#broadcast({ type: "invalidate", scope: "orders" });
    return { created };
  }

  // One-time load of the InstantDB export. Idempotent by primary key, so a
  // partial or repeated run is safe: rows already present are left alone.
  async importSnapshot(snapshot: {
    customers?: Record<string, any>[];
    shipments?: Record<string, any>[];
    orders?: Record<string, any>[];
    messages?: Record<string, any>[];
  }): Promise<Record<string, number>> {
    const sql = this.ctx.storage.sql;
    const ms = (v: unknown) => {
      if (v == null) return Date.now();
      const n = typeof v === "number" ? v : new Date(String(v)).getTime();
      return Number.isFinite(n) ? n : Date.now();
    };
    const counts = { customers: 0, shipments: 0, orders: 0, packages: 0, messages: 0 };

    for (const c of snapshot.customers ?? []) {
      sql.exec(
        "INSERT OR IGNORE INTO customers (id, name, phone, created_at) VALUES (?, ?, ?, ?)",
        c.id,
        c.name == null ? null : String(c.name),
        c.phone ?? null,
        ms(c.createdAt),
      );
      counts.customers++;
    }

    for (const s of snapshot.shipments ?? []) {
      sql.exec(
        "INSERT OR IGNORE INTO shipments (id, title, created_at) VALUES (?, ?, ?)",
        s.id,
        s.title ?? "Untitled",
        ms(s.createdAt),
      );
      counts.shipments++;
    }

    for (const o of snapshot.orders ?? []) {
      sql.exec(
        `INSERT OR IGNORE INTO orders
           (id, customer_id, shipment_id, to_place, to_place_id, from_place, from_place_id,
            amount_total, amount_paid, clearance, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        o.id,
        o.customers?.id ?? null,
        o.shipments?.id ?? null,
        o.orderTo?.description ?? null,
        o.orderTo?.placeId ?? null,
        o.orderFrom?.description ?? null,
        o.orderFrom?.placeId ?? null,
        o.amountTotal ?? null,
        o.amountPaid ?? 0,
        o.clearance ?? null,
        ms(o.createdAt),
      );
      counts.orders++;

      for (const p of o.packages ?? []) {
        sql.exec(
          `INSERT OR IGNORE INTO packages (id, order_id, number, weight, length, width, height)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          p.id,
          o.id,
          p.number == null ? null : String(p.number),
          p.weight ?? null,
          p.length ?? null,
          p.width ?? null,
          p.height ?? null,
        );
        counts.packages++;
      }
    }

    for (const m of snapshot.messages ?? []) {
      sql.exec(
        `INSERT OR IGNORE INTO messages
           (id, customer_id, sid, direction, body, from_addr, to_addr, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        m.id,
        m.customers?.id ?? null,
        m.sid ?? null,
        m.direction ?? "inbound",
        String(m.body ?? ""),
        m.from ?? null,
        m.to ?? null,
        ms(m.createdAt),
      );
      counts.messages++;
    }

    this.#broadcast({ type: "invalidate", scope: "all" });
    return counts;
  }

  // Structured upserts for Dara -- deliberately not raw SQL, so table and
  // column names stay validated and the shape can carry an undo later. Runs
  // without an await between statements, so a batch commits atomically.
  async write(ops: WriteOp[]): Promise<{ written: number }> {
    const sql = this.ctx.storage.sql;

    for (const op of ops) {
      const columns = assertWritableOp(op);

      // packages is the one writable table without a created_at.
      const insertCols = [...columns];
      const insertVals = columns.map((c) => op.data[c] as unknown);
      if (op.table !== "packages") {
        insertCols.push("created_at");
        insertVals.push(Date.now());
      }

      // Only the caller's columns are updated on conflict, so created_at
      // survives an update to an existing row.
      const onConflict =
        columns.length > 0
          ? `DO UPDATE SET ${columns.map((c) => `${c} = excluded.${c}`).join(", ")}`
          : "DO NOTHING";

      sql.exec(
        `INSERT INTO ${op.table} (id${insertCols.length ? ", " + insertCols.join(", ") : ""})
         VALUES (?${", ?".repeat(insertCols.length)})
         ON CONFLICT(id) ${onConflict}`,
        op.id,
        ...insertVals,
      );
    }

    this.#broadcast({ type: "invalidate", scope: "orders" });
    return { written: ops.length };
  }

  // Read-only SQL for Dara. The DO boundary already prevents reaching another
  // tenant, so this only has to stop destructive statements within this one.
  async select(query: string, ...params: unknown[]) {
    return this.ctx.storage.sql
      .exec(assertReadOnlyQuery(query), ...params)
      .toArray();
  }

  // -- writes --------------------------------------------------------------

  async upsertCustomer(phone: string, name?: string | null): Promise<string> {
    const existing = this.ctx.storage.sql
      .exec<{ id: string }>("SELECT id FROM customers WHERE phone = ?", phone)
      .toArray();
    if (existing.length > 0) {
      if (name) {
        this.ctx.storage.sql.exec(
          "UPDATE customers SET name = COALESCE(name, ?) WHERE id = ?",
          name,
          existing[0].id,
        );
      }
      return existing[0].id;
    }
    const id = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      "INSERT INTO customers (id, name, phone, created_at) VALUES (?, ?, ?, ?)",
      id,
      name ?? null,
      phone,
      Date.now(),
    );
    return id;
  }

  // Returns false when the sid was already stored -- Twilio retries deliveries,
  // and the caller uses this to avoid replying twice.
  async recordMessage(m: MessageInput): Promise<boolean> {
    if (m.sid) {
      const seen = this.ctx.storage.sql
        .exec("SELECT 1 FROM messages WHERE sid = ?", m.sid)
        .toArray();
      if (seen.length > 0) return false;
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, customer_id, sid, direction, body, from_addr, to_addr, actor, channel, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m.id,
      m.customerId ?? null,
      m.sid ?? null,
      m.direction,
      m.body,
      m.from,
      m.to,
      m.actor,
      m.channel ?? "sms",
      Date.now(),
    );
    // Async now (Session's appendMessage wraps the auto-compaction check),
    // so this is no longer in the same transaction as the insert above --
    // an accepted tradeoff for getting compaction. messages is already
    // committed regardless; a failure here only means Dara's context misses
    // this one message until a later append succeeds, not a lost message.
    // Surfaced, not swallowed, same as every other agent-adjacent failure
    // in this file.
    if (m.customerId) {
      try {
        await this.#sessions()
          .getSession(m.customerId)
          .appendMessage(toSessionMessage(m));
      } catch (error) {
        await this.recordEvent({
          type: "agent.error",
          actor: "system",
          summary: "Dara's conversation memory failed to record a message",
          status: "failed",
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
          customerId: m.customerId,
        }).catch((e) => console.error("Could not record agent.error:", e));
      }
    }
    this.#broadcast({ type: "invalidate", scope: "messages" });
    return true;
  }

  // Byte-budgeted recent history for Dara's prompt, oldest-first on the
  // active branch. Replaces the old buildHistory(thread(...)) hand
  // truncation with the Session API's own budget accounting. Narrowed to
  // SessionMessageView on the way out -- see its doc comment for why.
  async getSessionHistory(
    customerId: string,
    maxBytes = 6000,
  ): Promise<SessionMessageView[]> {
    const { messages } = await this.#sessions()
      .getSession(customerId)
      .getRecentHistory(maxBytes, 4);
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.parts.map((p) => ({ type: p.type, text: p.text })),
    }));
  }

  // The "memory" context block's raw content -- what Dara has noted about
  // this customer across earlier conversations. null if nothing's been
  // saved yet.
  //
  // getContextBlock() itself is synchronous and reads from an in-memory
  // cache that only a handful of async methods populate (never on its own)
  // -- and since #sessions() builds a fresh Session on every call, that
  // cache always starts empty here, regardless of what's actually stored.
  // freezeSystemPrompt() is the smallest public method that forces the
  // provider load (`if (!this.loaded) await this.load()` internally); its
  // return value is unused, only the load it triggers matters.
  async getMemory(customerId: string): Promise<string | null> {
    const session = this.#sessions().getSession(customerId);
    await session.freezeSystemPrompt();
    const block = session.getContextBlock("memory");
    return block?.content || null;
  }

  async setMemory(customerId: string, content: string): Promise<void> {
    await this.#sessions().getSession(customerId).replaceContextBlock("memory", content);
  }

  // Fills in what an inbound SMS alone never gives you: a name to put on a
  // customs form, an email, a delivery address. Overwrites rather than merges
  // (COALESCE) -- resubmitting the form is how a customer corrects a typo, so
  // a blank field means "clear it," not "leave the old value."
  async submitProfile(
    customerId: string,
    patch: { name: string; email?: string | null; address?: PlaceView | null },
  ): Promise<CustomerProfileView> {
    const existing = this.ctx.storage.sql
      .exec("SELECT id FROM customers WHERE id = ?", customerId)
      .toArray();
    if (existing.length === 0) throw new Error("Customer not found");

    this.ctx.storage.sql.exec(
      `UPDATE customers
       SET name = ?, email = ?, address = ?, address_place_id = ?, onboarded_at = ?
       WHERE id = ?`,
      patch.name,
      patch.email ?? null,
      patch.address?.description ?? null,
      patch.address?.placeId ?? null,
      Date.now(),
      customerId,
    );
    await this.recordEvent({
      type: "customer.onboarded",
      actor: "customer",
      summary: `${patch.name} completed the profile form`,
      customerId,
    });

    const profile = await this.getCustomerProfile(customerId);
    if (!profile) throw new Error("Customer not found");
    return profile;
  }

  async recordEvent(e: EventInput): Promise<number> {
    const row = this.ctx.storage.sql
      .exec<{ id: number }>(
        `INSERT INTO events
           (type, actor, summary, payload, status, customer_id, order_id, shipment_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        e.type,
        e.actor,
        e.summary,
        e.payload === undefined ? null : JSON.stringify(e.payload),
        e.status ?? "ok",
        e.customerId ?? null,
        e.orderId ?? null,
        e.shipmentId ?? null,
        Date.now(),
      )
      .one();
    // No await between the insert and here, so both land in one transaction.
    this.#broadcast({ type: "invalidate", scope: "inbox" });
    return row.id;
  }

  async markHandled(eventId: number) {
    this.ctx.storage.sql.exec(
      "UPDATE events SET handled_at = ? WHERE id = ? AND handled_at IS NULL",
      Date.now(),
      eventId,
    );
    this.#broadcast({ type: "invalidate", scope: "inbox" });
  }

  // -- realtime ------------------------------------------------------------

  // RPC cannot return a 101, so the socket upgrade still goes through fetch().
  // acceptWebSocket (not ws.accept) is what lets the object hibernate while
  // operators stay connected -- duration isn't billed while it sleeps.
  override async fetch(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === "string" && message === "ping") ws.send("pong");
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
  }

  #broadcast(payload: unknown) {
    const data = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // A dead socket must not fail the write that triggered the broadcast.
      }
    }
  }
}
