import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { assertReadOnlyQuery, assertWritableOp } from "./tenant";
// The pool types `env` as `Cloudflare.Env`, a namespace interface designed to
// be merged with. Aliased on import because a bare `Env` inside the
// declaration would bind to the empty global one, not ours.
import type { Env as WorkerEnv } from "./rpc";

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

const tenant = (slug: string) => env.TENANT.getByName(slug);

describe("TenantDO", () => {
  it("creates the schema on first wake and reuses a customer by phone", async () => {
    const t = tenant("migrate-test");
    const first = await t.upsertCustomer("+14165550123", "Ada Okafor");
    const again = await t.upsertCustomer("+14165550123");
    expect(again).toBe(first);

    const rows = await t.select("SELECT name, phone FROM customers");
    expect(rows).toEqual([{ name: "Ada Okafor", phone: "+14165550123" }]);
  });

  // The property InstantDB could not express: phone is unique *within* a
  // tenant, and two forwarders may share a customer without colliding.
  it("isolates identical phone numbers across tenants", async () => {
    const a = tenant("forwarder-a");
    const b = tenant("forwarder-b");
    const inA = await a.upsertCustomer("+2348012345678", "Chidi");
    const inB = await b.upsertCustomer("+2348012345678", "Chidi");
    expect(inA).not.toBe(inB);

    expect(await a.select("SELECT COUNT(*) AS n FROM customers")).toEqual([
      { n: 1 },
    ]);
    expect(await b.select("SELECT COUNT(*) AS n FROM customers")).toEqual([
      { n: 1 },
    ]);
  });

  it("drops duplicate Twilio deliveries by sid", async () => {
    const t = tenant("dedupe-test");
    const message = {
      id: crypto.randomUUID(),
      sid: "SM123",
      direction: "inbound" as const,
      actor: "customer" as const,
      body: "where is my barrel",
      from: "+14165550100",
      to: "+16479526586",
    };
    expect(await t.recordMessage(message)).toBe(true);
    expect(
      await t.recordMessage({ ...message, id: crypto.randomUUID() }),
    ).toBe(false);

    expect(await t.select("SELECT COUNT(*) AS n FROM messages")).toEqual([
      { n: 1 },
    ]);
  });

  it("threads one customer's conversation across channels and actors, oldest first", async () => {
    const t = tenant("thread-test");
    const customerId = await t.upsertCustomer("+14165550199", "Bola");
    const otherCustomerId = await t.upsertCustomer("+14165550200", "Chika");

    await t.recordMessage({
      id: crypto.randomUUID(),
      customerId,
      direction: "inbound",
      actor: "customer",
      body: "where is my barrel",
      from: "+14165550199",
      to: "+16479526586",
    });
    await t.recordMessage({
      id: crypto.randomUUID(),
      customerId,
      direction: "outbound",
      actor: "dara",
      body: "It's clearing customs now.",
      from: "+16479526586",
      to: "+14165550199",
    });
    // A different customer's message must not leak into this thread.
    await t.recordMessage({
      id: crypto.randomUUID(),
      customerId: otherCustomerId,
      direction: "inbound",
      actor: "customer",
      body: "unrelated",
      from: "+14165550200",
      to: "+16479526586",
    });

    const thread = await t.thread(customerId);
    expect(thread.map((m) => m.body)).toEqual([
      "where is my barrel",
      "It's clearing customs now.",
    ]);
    expect(thread[0].actor).toBe("customer");
    expect(thread[1].actor).toBe("dara");
    expect(thread.every((m) => m.channel === "sms")).toBe(true);
  });

  // recordMessage fans out into the Agents SDK Session API alongside the
  // messages table -- this is Dara's actual read path (webhook.ts calls
  // getSessionHistory, not thread()+buildHistory anymore).
  it("keeps Dara's session history in sync with recorded messages", async () => {
    const t = tenant("session-history-test");
    const customerId = await t.upsertCustomer("+14165550299", "Femi");

    await t.recordMessage({
      id: crypto.randomUUID(),
      customerId,
      direction: "inbound",
      actor: "customer",
      body: "where is my barrel",
      from: "+14165550299",
      to: "+16479526586",
    });
    await t.recordMessage({
      id: crypto.randomUUID(),
      customerId,
      direction: "outbound",
      actor: "dara",
      body: "It's clearing customs now.",
      from: "+16479526586",
      to: "+14165550299",
    });
    await t.recordMessage({
      id: crypto.randomUUID(),
      customerId,
      direction: "outbound",
      actor: "operator",
      body: "I'll call the broker myself.",
      from: "+16479526586",
      to: "+14165550299",
    });

    const history = await t.getSessionHistory(customerId);
    expect(history.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "assistant",
    ]);
    const text = (m: (typeof history)[number]) =>
      m.parts.find((p) => p.type === "text")?.text;
    expect(text(history[0])).toBe("where is my barrel");
    // Dara's own voice needs no marker; an operator's manual reply does, so
    // it can never read back to Dara as its own words.
    expect(text(history[1])).toBe("It's clearing customs now.");
    expect(text(history[2])).toBe("[Operator] I'll call the broker myself.");
  });

  // getMemory/setMemory are plain SQLite-backed context-block storage -- no
  // AI call involved, unlike compaction, which is why this is safe as a
  // fast standing test.
  it("remembers a note about a customer and keeps it isolated per customer", async () => {
    const t = tenant("memory-test");
    const customerId = await t.upsertCustomer("+14165550399", "Ngozi");
    const otherCustomerId = await t.upsertCustomer("+14165550400", "Tunde");

    expect(await t.getMemory(customerId)).toBeNull();

    await t.setMemory(customerId, "Prefers WhatsApp over SMS.");
    expect(await t.getMemory(customerId)).toBe("Prefers WhatsApp over SMS.");

    // A note for one customer must not leak into another's.
    expect(await t.getMemory(otherCustomerId)).toBeNull();
  });

  it("surfaces agent failures above routine activity in the inbox", async () => {
    const t = tenant("inbox-test");
    await t.recordEvent({
      type: "message.out",
      actor: "dara",
      summary: "Your shipment sails Friday.",
    });
    const failureId = await t.recordEvent({
      type: "agent.failed",
      actor: "dara",
      summary: "Dara failed to answer +14165550100",
      status: "needs_review",
    });

    const inbox = await t.inbox();
    expect(inbox).toHaveLength(2);
    expect(inbox[0].summary).toBe("Dara failed to answer +14165550100");

    await t.markHandled(failureId);
    const after = await t.inbox();
    expect(after).toHaveLength(1);
    expect(after[0].type).toBe("message.out");
  });

  it("imports a manifest, deduping customers by phone", async () => {
    const t = tenant("import-test");
    const shipmentId = await t.createShipment("New Shipment");

    const result = await t.importPackages({
      shipmentId,
      fileName: "june-manifest.csv",
      defaultTitle: "New Shipment",
      from: { description: "Lagos Office", placeId: "lag" },
      to: { description: "Toronto Office", placeId: "tor" },
      packages: [
        { number: "1", name: "Ada", phone: "+2348011111111", weight: 12 },
        { number: "2", name: "Ada", phone: "+2348011111111", weight: 8 },
        { number: "3", name: "Bode", phone: "+2348022222222", weight: 20 },
      ],
    });
    expect(result.created).toBe(3);

    // Two orders share one customer; the third gets its own.
    expect(await t.select("SELECT COUNT(*) AS n FROM customers")).toEqual([
      { n: 2 },
    ]);

    const shipment = await t.getShipment(shipmentId);
    // An untouched shipment takes the manifest's name.
    expect(shipment?.title).toBe("june-manifest.csv");
    expect(shipment?.orders).toHaveLength(3);

    const ada = shipment!.orders.filter((o) => o.customers?.name === "Ada");
    expect(ada).toHaveLength(2);
    expect(ada[0].orderTo?.description).toBe("Toronto Office");
    expect(ada[0].orderFrom?.description).toBe("Lagos Office");
    expect(ada[0].packages).toHaveLength(1);
  });

  it("assembles nested orders and filters by id", async () => {
    const t = tenant("orders-view-test");
    const shipmentId = await t.createShipment("Lagos June");
    await t.importPackages({
      shipmentId,
      from: { description: "Lagos", placeId: "l" },
      to: { description: "Toronto", placeId: "t" },
      packages: [
        { number: "1", name: "Ngozi", phone: "+2348033333333", weight: 5 },
        { number: "2", name: "Emeka", phone: "+2348044444444", weight: 7 },
      ],
    });

    const all = await t.listOrders();
    expect(all).toHaveLength(2);
    expect(all[0].shipments?.title).toBe("Lagos June");

    const one = await t.ordersByIds([all[0].id]);
    expect(one).toHaveLength(1);
    expect(one[0].id).toBe(all[0].id);

    expect(await t.ordersByIds([])).toEqual([]);
  });

  it("upserts through write() and rejects unknown tables and columns", async () => {
    const t = tenant("write-test");
    const orderId = crypto.randomUUID();

    await t.write([
      { table: "orders", id: orderId, data: { clearance: "In Transit" } },
    ]);
    expect(
      await t.select("SELECT clearance FROM orders WHERE id = ?", orderId),
    ).toEqual([{ clearance: "In Transit" }]);

    // Writing the same id updates only the columns passed.
    await t.write([
      { table: "orders", id: orderId, data: { amount_paid: 4000 } },
    ]);
    expect(
      await t.select(
        "SELECT clearance, amount_paid FROM orders WHERE id = ?",
        orderId,
      ),
    ).toEqual([{ clearance: "In Transit", amount_paid: 4000 }]);

    // Validation is checked directly rather than through the stub: a rejected
    // Durable Object RPC promise surfaces twice through the test pool.
    expect(() =>
      assertWritableOp({ table: "events", id: "x", data: { summary: "hi" } }),
    ).toThrow(/Cannot write to "events"/);
    expect(() =>
      assertWritableOp({
        table: "orders",
        id: "y",
        data: { "id = 1; DROP TABLE orders": 1 },
      }),
    ).toThrow(/Unknown column/);
    expect(() =>
      assertWritableOp({ table: "orders", id: "", data: {} }),
    ).toThrow(/missing an id/);
  });

  it("loads an Instant snapshot idempotently", async () => {
    const t = tenant("snapshot-test");
    const snapshot = {
      customers: [{ id: "c1", name: "Ada", phone: "+15550001111" }],
      shipments: [{ id: "s1", title: "March Sailing" }],
      orders: [
        {
          id: "o1",
          amountTotal: 200,
          clearance: "Cleared",
          customers: { id: "c1" },
          shipments: { id: "s1" },
          orderFrom: { description: "Lagos", placeId: "l" },
          orderTo: { description: "Toronto", placeId: "t" },
          packages: [{ id: "p1", number: "1", weight: 9 }],
        },
      ],
      messages: [
        {
          id: "m1",
          body: "where is my barrel",
          direction: "inbound",
          customers: { id: "c1" },
        },
      ],
    };

    expect(await t.importSnapshot(snapshot)).toMatchObject({
      customers: 1,
      shipments: 1,
      orders: 1,
      packages: 1,
      messages: 1,
    });

    const orders = await t.listOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].customers?.name).toBe("Ada");
    expect(orders[0].shipments?.title).toBe("March Sailing");
    expect(orders[0].packages[0].weight).toBe(9);

    // Re-running must not duplicate anything.
    await t.importSnapshot(snapshot);
    expect(await t.select("SELECT COUNT(*) AS n FROM orders")).toEqual([
      { n: 1 },
    ]);
    expect(await t.select("SELECT COUNT(*) AS n FROM customers")).toEqual([
      { n: 1 },
    ]);
  });

  it("provisions a tenant idempotently and keeps its name current", async () => {
    const t = tenant("org_provision_test");

    const first = await t.ensureInitialized("org_abc", "Kano Freight Ltd");
    expect(first.orgId).toBe("org_abc");
    expect(first.name).toBe("Kano Freight Ltd");
    expect(first.markup).toBe(1.3);

    // Every dashboard load calls this; it must not duplicate or reset state.
    await t.updateSettings({ markup: 1.5 });
    const second = await t.ensureInitialized("org_abc", "Kano Freight Limited");
    expect(second.name).toBe("Kano Freight Limited");
    expect(second.markup).toBe(1.5);
    expect(second.createdAt).toBe(first.createdAt);

    expect(await t.select("SELECT COUNT(*) AS n FROM tenant")).toEqual([
      { n: 1 },
    ]);
  });

  it("fills in a customer's profile from the profile form", async () => {
    const t = tenant("profile-test");
    const customerId = await t.upsertCustomer("+14165550177");

    // Not onboarded yet: upsertCustomer alone only knows a phone number.
    const before = await t.getCustomerProfile(customerId);
    expect(before?.name).toBeNull();
    expect(before?.onboardedAt).toBeNull();

    const after = await t.submitProfile(customerId, {
      name: "Ngozi Eze",
      email: "ngozi@example.com",
      address: { description: "12 Bay St, Toronto", placeId: "place_1" },
    });
    expect(after.name).toBe("Ngozi Eze");
    expect(after.email).toBe("ngozi@example.com");
    expect(after.address).toEqual({
      description: "12 Bay St, Toronto",
      placeId: "place_1",
    });
    expect(after.onboardedAt).toBeGreaterThan(0);

    // Resubmitting overwrites rather than merges -- a blank field clears it.
    const resubmitted = await t.submitProfile(customerId, {
      name: "Ngozi Eze",
      email: null,
      address: null,
    });
    expect(resubmitted.email).toBeNull();
    expect(resubmitted.address).toBeNull();

    // Shows up as a needs-review-free activity item, not just a silent write.
    const inbox = await t.inbox();
    expect(inbox.some((e) => e.type === "customer.onboarded")).toBe(true);
  });

  it("rejects a profile submission for a customer id that doesn't exist", async () => {
    const t = tenant("profile-missing-test");
    const failure = await t
      .submitProfile("no-such-customer", { name: "Ghost" })
      .catch((e: Error) => e.message);
    expect(failure).toMatch(/not found/);
  });

  it("reports an unprovisioned tenant rather than inventing one", async () => {
    const t = tenant("org_blank_test");
    // The object exists the moment it is addressed, so "created" and
    // "configured" are different states and settings() must tell them apart.
    // .catch on the RPC promise itself, rather than try/await: the test pool
    // surfaces a rejected Durable Object call twice, and the second copy lands
    // as an unhandled rejection if only the awaited chain is handled.
    const failure = await t.settings().catch((e: Error) => e.message);
    expect(failure).toMatch(/not been initialized/);
  });
});

describe("RegistryDO", () => {
  const reg = (name: string) => env.REGISTRY.getByName(name);

  it("routes a phone number to the org that claimed it", async () => {
    const r = reg("routing-test");
    await r.registerOrg("org_a", "Forwarder A");
    await r.claimNumber("+16479526586", "org_a");

    expect(await r.orgForNumber("+16479526586")).toBe("org_a");
    expect(await r.orgForNumber("+15550000000")).toBeNull();
  });

  it("refuses to hand another org's number to a new claimant", async () => {
    const r = reg("conflict-test");
    await r.registerOrg("org_a", "Forwarder A");
    await r.registerOrg("org_b", "Forwarder B");
    await r.claimNumber("+2348011111111", "org_a");

    // Silently reassigning would redirect a live SMS thread to someone else.
    const denied = await r
      .claimNumber("+2348011111111", "org_b")
      .catch((e: Error) => e.message);
    expect(denied).toMatch(/already claimed/);
    expect(await r.orgForNumber("+2348011111111")).toBe("org_a");

    // Re-claiming your own number stays a no-op.
    await r.claimNumber("+2348011111111", "org_a");
    expect(await r.orgForNumber("+2348011111111")).toBe("org_a");
  });
});

describe("TenantDO guards", () => {
  it("refuses anything but a single read-only statement", () => {
    expect(() => assertReadOnlyQuery("DELETE FROM customers")).toThrow(
      /read-only/,
    );
    expect(() => assertReadOnlyQuery("SELECT 1; DROP TABLE customers")).toThrow(
      /single statement/,
    );
    // A leading comment must not disguise a write.
    expect(() =>
      assertReadOnlyQuery("-- totally a select\n UPDATE customers SET name='x'"),
    ).toThrow(/read-only/);

    expect(assertReadOnlyQuery("  SELECT 1  ")).toBe("SELECT 1");
    expect(assertReadOnlyQuery("WITH t AS (SELECT 1) SELECT * FROM t")).toMatch(
      /^WITH/,
    );
  });
});
