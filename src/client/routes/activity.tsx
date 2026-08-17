import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "../data";
import {
  IconPackage,
  IconMessageCircle,
  IconTruckDelivery,
  IconChevronDown,
  IconArrowUpRight,
} from "@tabler/icons-react";

// The feed is derived from the timestamps already on the data rather than a
// stored event log, so it covers creations and messages but not field edits.
// Add an `activity` entity written at each mutation point to capture those.

type SubjectType = "order" | "customer" | "shipment";

interface FeedEvent {
  id: string;
  at: number;
  title: string;
  detail?: string;
}

interface Subject {
  key: string;
  type: SubjectType;
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  events: FeedEvent[];
  lastAt: number;
  meta: { label: string; value: string }[];
}

const TYPE_ICON = {
  order: IconPackage,
  customer: IconMessageCircle,
  shipment: IconTruckDelivery,
} as const;

const FILTERS = [
  { id: "all", label: "All" },
  { id: "order", label: "Orders" },
  { id: "customer", label: "Messages" },
  { id: "shipment", label: "Shipments" },
] as const;

// createdAt is an untyped column: ISO strings from the web flow, epoch millis
// from the agent. Anything unparseable sorts to the bottom.
const toMs = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const timeAgo = (ms: number) => {
  if (!ms) return "—";
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
};

const fullTime = (ms: number) =>
  ms
    ? new Date(ms).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const statusTone = (status?: string) =>
  status === "Delivered"
    ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
    : status === "Cleared"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : status === "In Transit"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-surface-alt text-text-secondary";

const shortId = (value: string) => String(value).slice(0, 8);

const initials = (name?: string) =>
  (name ?? "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "SM";

export const Activity = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const expandedKey = searchParams.get("item");
  const filter = searchParams.get("filter") ?? "all";

  const orders = useQuery("listOrders");
  const messages = useQuery("listMessages", 200);
  const shipments = useQuery("listShipments");

  const isLoading =
    orders.isLoading || messages.isLoading || shipments.isLoading;
  const error = orders.error ?? messages.error ?? shipments.error;

  const subjects = useMemo<Subject[]>(() => {
    const list: Subject[] = [];

    for (const order of orders.data ?? []) {
      const at = toMs(order.createdAt);
      const from = order.orderFrom?.description;
      const to = order.orderTo?.description;
      const weight = (order.packages ?? []).reduce(
        (total, pkg) => total + (Number(pkg.weight) || 0),
        0,
      );
      list.push({
        key: `order:${order.id}`,
        type: "order",
        id: order.id,
        title: order.customers?.name || `Order ${shortId(order.id)}`,
        subtitle: from && to ? `${from} → ${to}` : "Route not set",
        status: order.clearance ?? undefined,
        lastAt: at,
        events: [
          {
            id: `${order.id}:created`,
            at,
            title: "Order created",
            detail: to ? `Destination ${to}` : undefined,
          },
          ...(Number(order.amountPaid) > 0
            ? [
                {
                  id: `${order.id}:paid`,
                  at,
                  title: "Payment received",
                  detail: `$${order.amountPaid} of $${order.amountTotal ?? order.amountPaid}`,
                },
              ]
            : []),
        ],
        meta: [
          { label: "Order", value: `#${shortId(order.id)}` },
          { label: "Customer", value: order.customers?.name || "—" },
          { label: "Phone", value: order.customers?.phone || "—" },
          { label: "Route", value: from && to ? `${from} → ${to}` : "—" },
          {
            label: "Packages",
            value: `${(order.packages ?? []).length}${weight ? ` · ${weight} kg` : ""}`,
          },
          {
            label: "Total",
            value: order.amountTotal ? `$${order.amountTotal}` : "—",
          },
          { label: "Shipment", value: order.shipments?.title || "Unassigned" },
        ],
      });
    }

    // Messages thread per customer -- the conversation is the subject, the way
    // an email client threads by participant rather than by individual message.
    const byCustomer = new Map<string, FeedEvent[]>();
    const customerInfo = new Map<string, { name?: string; phone?: string }>();
    for (const message of messages.data ?? []) {
      const customer = message.customers;
      if (!customer) continue;
      customerInfo.set(customer.id, {
        name: customer.name ?? undefined,
        phone: customer.phone ?? undefined,
      });
      const inbound = message.direction === "inbound";
      const events = byCustomer.get(customer.id) ?? [];
      events.push({
        id: message.id,
        at: toMs(message.createdAt),
        title: inbound ? "Message received" : "Message sent",
        detail: String(message.body ?? ""),
      });
      byCustomer.set(customer.id, events);
    }
    for (const [customerId, events] of byCustomer) {
      const info = customerInfo.get(customerId) ?? {};
      const sorted = [...events].sort((a, b) => b.at - a.at);
      list.push({
        key: `customer:${customerId}`,
        type: "customer",
        id: customerId,
        title: info.name || info.phone || "Customer",
        subtitle: info.phone || "No phone on file",
        status: "Conversation",
        lastAt: sorted[0]?.at ?? 0,
        events: sorted,
        meta: [
          { label: "Customer", value: info.name || "—" },
          { label: "Phone", value: info.phone || "—" },
          { label: "Messages", value: String(sorted.length) },
        ],
      });
    }

    // shipments carry no timestamp of their own in the client schema, so the
    // thread is timed by the orders loaded into it.
    for (const shipment of shipments.data ?? []) {
      const orders = shipment.orders ?? [];
      const events: FeedEvent[] = orders.length
        ? orders
            .map((order) => ({
              id: `${shipment.id}:${order.id}`,
              at: toMs(order.createdAt),
              title: "Order added",
              detail: `#${shortId(order.id)}`,
            }))
            .sort((a, b) => b.at - a.at)
        : [{ id: `${shipment.id}:created`, at: 0, title: "Shipment created" }];
      list.push({
        key: `shipment:${shipment.id}`,
        type: "shipment",
        id: shipment.id,
        title: shipment.title || "Untitled shipment",
        subtitle: `${orders.length} order${orders.length === 1 ? "" : "s"}`,
        status: orders.length ? "Loading" : "Empty",
        lastAt: events[0]?.at ?? 0,
        events,
        meta: [
          { label: "Shipment", value: shipment.title || "—" },
          { label: "Orders", value: String(orders.length) },
          { label: "Last activity", value: fullTime(events[0]?.at ?? 0) },
        ],
      });
    }

    return list.sort((a, b) => b.lastAt - a.lastAt);
  }, [orders.data, messages.data, shipments.data]);

  if (isLoading) {
    return (
      <div className="w-8 h-8 border-4 border-spinner border-t-transparent rounded-full animate-spin m-auto" />
    );
  }

  if (error) {
    return (
      <div className="text-primary p-6">
        An error occurred, please try again later
      </div>
    );
  }

  const visible =
    filter === "all" ? subjects : subjects.filter((s) => s.type === filter);

  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="w-full h-full overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto w-full max-w-150 px-3 py-5 flex flex-col gap-4">
        {/* Filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              onClick={() =>
                setParam("filter", option.id === "all" ? null : option.id)
              }
              className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors cursor-pointer ${
                filter === option.id
                  ? "bg-primary text-white"
                  : "bg-surface-alt text-text-secondary hover:bg-hover"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="py-16 text-center text-sm italic text-text-muted">
            Nothing here yet
          </p>
        ) : (
          visible.map((subject) => {
            const Icon = TYPE_ICON[subject.type];
            const latest = subject.events[0];
            const expanded = expandedKey === subject.key;
            return (
              <article
                key={subject.key}
                className="bg-surface rounded-xl border border-border overflow-hidden"
              >
                {/* The whole post is the affordance: orders and shipments open
                    their own page, conversations expand in place because they
                    have no page of their own. */}
                <button
                  onClick={() => {
                    if (subject.type === "order") {
                      navigate(`/orders/${subject.id}`);
                    } else if (subject.type === "shipment") {
                      navigate(`/dashboard/shipments/${subject.id}`);
                    } else {
                      setParam("item", expanded ? null : subject.key);
                    }
                  }}
                  className="w-full text-left hover:bg-hover transition-colors cursor-pointer"
                >
                {/* Post header */}
                <header className="flex items-center gap-3 px-4 pt-4 pb-3">
                  {subject.type === "customer" ? (
                    <span className="w-10 h-10 shrink-0 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                      {initials(subject.title)}
                    </span>
                  ) : (
                    <span className="w-10 h-10 shrink-0 rounded-full bg-surface-alt text-text-secondary flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-text-primary truncate">
                      {subject.title}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {subject.subtitle} · {timeAgo(subject.lastAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusTone(subject.status)}`}
                  >
                    {subject.status || "Open"}
                  </span>
                  {subject.type === "customer" ? (
                    <IconChevronDown
                      className={`w-4 h-4 shrink-0 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  ) : (
                    <IconArrowUpRight className="w-4 h-4 shrink-0 text-text-muted" />
                  )}
                </header>

                {/* Post body */}
                <div className="px-4 pb-4">
                  <p className="text-sm text-text-primary">
                    {latest?.title ?? "No activity"}
                  </p>
                  {latest?.detail && (
                    <p className="text-sm text-text-secondary mt-1 wrap-break-word">
                      {latest.detail}
                    </p>
                  )}
                  {subject.events.length > 1 && (
                    <p className="text-xs text-text-muted mt-2">
                      {subject.events.length} updates
                    </p>
                  )}
                </div>
                </button>

                {/* Expanded detail — conversations only */}
                {expanded && (
                  <div className="border-t border-border-muted bg-surface-alt/40 px-4 py-5 flex flex-col gap-6">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                      {subject.meta.map((entry) => (
                        <div key={entry.label} className="min-w-0">
                          <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted mb-1">
                            {entry.label}
                          </p>
                          <p className="text-sm text-text-primary truncate">
                            {entry.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted mb-4">
                        Timeline
                      </p>
                      <div className="flex flex-col">
                        {subject.events.map((event, index) => (
                          <div key={event.id} className="flex gap-3">
                            <div className="flex flex-col items-center shrink-0">
                              <span className="w-2 h-2 mt-1.5 rounded-full bg-primary" />
                              {index < subject.events.length - 1 && (
                                <span className="flex-1 w-px bg-border my-1" />
                              )}
                            </div>
                            <div className="min-w-0 pb-5 flex-1">
                              <div className="flex items-baseline justify-between gap-3">
                                <p className="text-sm font-medium text-text-primary">
                                  {event.title}
                                </p>
                                <p className="text-[11px] text-text-muted shrink-0">
                                  {fullTime(event.at)}
                                </p>
                              </div>
                              {event.detail && (
                                <p className="text-sm text-text-secondary mt-1 wrap-break-word">
                                  {event.detail}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Activity;
