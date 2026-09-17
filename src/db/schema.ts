import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// These definitions mirror the existing Durable Object migrations. Keeping the
// schema here lets application code use typed Drizzle queries without moving
// tenant data out of its current per-object SQLite database.
export const customers = sqliteTable("customers", {
  id: text().primaryKey(),
  name: text(),
  phone: text().unique(),
  email: text(),
  address: text(),
  addressPlaceId: text("address_place_id"),
  onboardedAt: integer("onboarded_at"),
  createdAt: integer("created_at").notNull(),
});

export const shipments = sqliteTable("shipments", {
  id: text().primaryKey(),
  title: text().notNull(),
  status: text().notNull().default("open"),
  departsAt: integer("departs_at"),
  arrivesAt: integer("arrives_at"),
  createdAt: integer("created_at").notNull(),
});

export const orders = sqliteTable(
  "orders",
  {
    id: text().primaryKey(),
    customerId: text("customer_id").references(() => customers.id),
    shipmentId: text("shipment_id").references(() => shipments.id),
    toPlace: text("to_place"),
    toPlaceId: text("to_place_id"),
    fromPlace: text("from_place"),
    fromPlaceId: text("from_place_id"),
    amountTotal: integer("amount_total"),
    amountPaid: integer("amount_paid").notNull().default(0),
    clearance: text(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_orders_shipment").on(table.shipmentId)],
);

export const packages = sqliteTable(
  "packages",
  {
    id: text().primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    number: text(),
    weight: real(),
    length: real(),
    width: real(),
    height: real(),
  },
  (table) => [index("idx_packages_order").on(table.orderId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text().primaryKey(),
    customerId: text("customer_id").references(() => customers.id),
    sid: text().unique(),
    direction: text().notNull(),
    body: text().notNull(),
    from: text("from_addr"),
    to: text("to_addr"),
    actor: text(),
    channel: text().notNull().default("sms"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_msgs_customer").on(table.customerId, table.createdAt)],
);

export const events = sqliteTable(
  "events",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    type: text().notNull(),
    actor: text().notNull(),
    summary: text().notNull(),
    payload: text(),
    status: text().notNull().default("ok"),
    customerId: text("customer_id"),
    orderId: text("order_id"),
    shipmentId: text("shipment_id"),
    handledAt: integer("handled_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_events_open").on(table.handledAt, table.createdAt)],
);

export const tenant = sqliteTable("tenant", {
  id: integer().primaryKey(),
  orgId: text("org_id").notNull(),
  name: text().notNull(),
  twilioNumber: text("twilio_number"),
  origin: text(),
  originPlaceId: text("origin_place_id"),
  destination: text(),
  destinationPlaceId: text("destination_place_id"),
  markup: real().notNull().default(1.3),
  createdAt: integer("created_at").notNull(),
});

export const orgs = sqliteTable("orgs", {
  orgId: text("org_id").primaryKey(),
  name: text().notNull(),
  createdAt: integer("created_at").notNull(),
});

export const numbers = sqliteTable("numbers", {
  phone: text().primaryKey(),
  orgId: text("org_id").notNull(),
});
