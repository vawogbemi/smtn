import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { publicApi, useQuery, useTenantApi } from "../data";
import { RequireTenant } from "../onboarding";
import type { MessageView, OrderView } from "../../tenant";
import {
  IconSearch,
  IconPlus,
  IconSend, IconPackage,
  IconMapPin, IconChevronLeft,
  IconX, IconMicrophone,
  IconCircleCheck, IconCurrencyDollar,
  IconChevronRight, IconInfoCircle,
  IconShare
} from "@tabler/icons-react";
export interface ChatMessage {
  id: string;
  sender: "user" | "customer" | "system";
  text: string;
  timestamp: string;
  status?: "sent" | "delivered" | "read";
  card?: {
    type: string;
    title: string;
    subtitle?: string;
    amount?: number;
    badge?: string;
    origin?: string;
    destination?: string;
  };
}

// Uber-style theme: stark black/white surfaces, gray dividers, green live accent.
const UBER_GREEN = "#06C167";

const TRACK_STEPS = ["Order placed", "In transit", "Customs", "Delivered"] as const;

const statusStep = (clearance?: string | null) =>
  clearance === "Delivered" ? 4 : clearance === "Cleared" ? 3 : clearance === "In Transit" ? 2 : 1;

// Uber leads with the ETA, so the headline is a date derived from the order's
// age plus the transit time typical for its current stage.
const etaLabel = (createdAt?: string | number | null, days = 5) => {
  const started = createdAt ? new Date(createdAt).getTime() : Date.now();
  const base = Number.isNaN(started) ? Date.now() : started;
  return new Date(base + days * 86_400_000).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const statusHeadline = (
  clearance?: string | null,
  destination?: string | null,
  createdAt?: string | number | null,
) =>
  clearance === "Delivered"
    ? { title: "Delivered", sub: `Signed for at ${destination ?? "destination"}` }
    : clearance === "Cleared"
      ? { title: "Arriving today", sub: "Cleared customs · Out for delivery" }
      : clearance === "In Transit"
        ? {
            title: `Arriving ${etaLabel(createdAt, 5)}`,
            sub: `In transit to ${destination ?? "destination"}`,
          }
        : {
            title: `Arriving ${etaLabel(createdAt, 7)}`,
            sub: "Preparing your shipment for departure",
          };

// Stylized street map standing in for live tracking: pale ground, white streets,
// a bold route line, square origin marker and ringed destination pin.
const RouteMap = () => (
  <div className="absolute inset-0 overflow-hidden bg-[#e8e8e6] dark:bg-neutral-800">
    <svg className="w-full h-full" viewBox="0 0 800 380" preserveAspectRatio="xMidYMid slice">
      <g className="stroke-white dark:stroke-neutral-700" strokeWidth="10">
        <line x1="0" y1="80" x2="800" y2="80" />
        <line x1="0" y1="190" x2="800" y2="190" />
        <line x1="0" y1="300" x2="800" y2="300" />
        <line x1="120" y1="0" x2="120" y2="380" />
        <line x1="300" y1="0" x2="300" y2="380" />
        <line x1="480" y1="0" x2="480" y2="380" />
        <line x1="660" y1="0" x2="660" y2="380" />
      </g>
      <g className="stroke-white dark:stroke-neutral-700" strokeWidth="5" opacity="0.7">
        <line x1="0" y1="135" x2="800" y2="135" />
        <line x1="0" y1="245" x2="800" y2="245" />
        <line x1="210" y1="0" x2="210" y2="380" />
        <line x1="390" y1="0" x2="390" y2="380" />
        <line x1="570" y1="0" x2="570" y2="380" />
        <line x1="740" y1="0" x2="740" y2="380" />
      </g>
      <path
        d="M 120 300 L 300 300 L 300 190 L 480 190 L 480 80 L 660 80"
        fill="none"
        className="stroke-black dark:stroke-white"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="112" y="292" width="16" height="16" className="fill-black dark:fill-white" />
      <circle cx="480" cy="190" r="9" fill={UBER_GREEN} className="animate-pulse" />
      <circle cx="660" cy="80" r="11" className="fill-black dark:fill-white" />
      <circle cx="660" cy="80" r="4.5" className="fill-white dark:fill-black" />
    </svg>
  </div>
);

type OrderEntity = OrderView;

// The staff-facing, authenticated view: full order list, search, compose.
// Reached only when there is no tracking token in the URL -- see the Orders
// wrapper at the bottom of this file, which is what actually gets exported.
const StaffOrders = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [inputText, setInputText] = useState("");
  // Order details -- ETA, route, packages, share -- used to be the whole
  // main pane with chat toggled on top of it. Now chat is always the main
  // pane, and this is a drawer that slides out from the right instead.
  const [showDetails, setShowDetails] = useState(false);
  const [showCardMenu, setShowCardMenu] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const getApi = useTenantApi();
  const { isLoading, error, data } = useQuery("listOrders");

  const ordersList: OrderEntity[] = data ?? [];

  // May be undefined: an empty database shows an empty list, not sample data.
  const activeOrder = ordersList.find((o) => o.id === orderId) ?? ordersList[0];
  const activeCustomerId = activeOrder?.customers?.id;

  // The real, persistent conversation: threaded by customer, not by order --
  // a shipper with three orders has one ongoing SMS thread, not three. Empty
  // string is a harmless no-op query (no customer_id is ever ""), which keeps
  // this a plain hook call with nothing to select before an order is chosen.
  const { data: realThread } = useQuery("thread", activeCustomerId ?? "");

  // Sent-but-not-yet-refetched messages, so a reply appears immediately
  // instead of waiting for the round trip + broadcast. Cleared per id once
  // the real thread contains that id.
  const [pending, setPending] = useState<ChatMessage[]>([]);
  // Rich card attachments (quick-action buttons like "Order Status Card") are
  // a local visual layer, never persisted -- messages carry only their plain
  // text body server-side. Keyed by message id so a card survives the switch
  // from pending to real once the thread refetches.
  const [cardsById, setCardsById] = useState<Record<string, ChatMessage["card"]>>({});

  useEffect(() => {
    setPending((prev) => {
      const realIds = new Set((realThread ?? []).map((m) => m.id));
      const next = prev.filter((m) => !realIds.has(m.id));
      return next.length === prev.length ? prev : next;
    });
  }, [realThread]);

  const toChatMessage = (m: MessageView): ChatMessage => ({
    id: m.id,
    sender: m.direction === "inbound" ? "customer" : "user",
    text: m.body,
    timestamp: m.createdAt
      ? new Date(m.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "",
    status: m.direction === "outbound" ? "delivered" : undefined,
    card: cardsById[m.id],
  });

  const currentMessages: ChatMessage[] = !activeOrder
    ? []
    : [
        {
          id: "default-1",
          sender: "system",
          text: `Order #${activeOrder.id} initiated`,
          timestamp: "Just now",
          card: {
            type: "order_summary",
            title: `Order #${activeOrder.id}`,
            subtitle: `${activeOrder.packages?.length ?? 0} package(s)`,
            amount: activeOrder.amountTotal ?? undefined,
            badge: activeOrder.clearance ?? "Pending",
            origin: activeOrder.orderFrom?.description ?? "Origin",
            destination: activeOrder.orderTo?.description ?? "Destination",
          },
        },
        ...(realThread ?? []).map(toChatMessage),
        ...pending,
      ];

  // Scroll to bottom of message list on updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages.length, activeOrder?.id]);

  // The chat is always on screen now (not behind a toggle), so focus moves
  // to the composer whenever the open conversation changes instead.
  useEffect(() => {
    if (activeOrder) messageInputRef.current?.focus();
  }, [activeOrder?.id]);

  // Last message per customer, for the sidebar preview -- one tenant-wide
  // query rather than one per order, since hooks can't run inside a loop.
  const { data: allMessages } = useQuery("listMessages", 200);
  const lastMessageByCustomer = useMemo(() => {
    const map = new Map<string, MessageView>();
    for (const m of allMessages ?? []) {
      const cid = m.customers?.id;
      if (!cid) continue;
      const prev = map.get(cid);
      if (!prev || (m.createdAt ?? 0) > (prev.createdAt ?? 0)) map.set(cid, m);
    }
    return map;
  }, [allMessages]);

  // Filter orders by search
  const filteredOrders = ordersList.filter((order) => {
    const custName = order.customers?.name?.toLowerCase() || "";
    const idStr = order.id.toLowerCase();
    const fromStr = order.orderFrom?.description?.toLowerCase() || "";
    const toStr = order.orderTo?.description?.toLowerCase() || "";
    const query = searchQuery.toLowerCase();
    return (
      custName.includes(query) ||
      idStr.includes(query) ||
      fromStr.includes(query) ||
      toStr.includes(query)
    );
  });

  const handleSendMessage = (customText?: string, customCard?: ChatMessage["card"]) => {
    const order = activeOrder;
    if (!order) return;
    const textToSend = customText !== undefined ? customText : inputText.trim();
    if (!textToSend && !customCard) return;

    const id = crypto.randomUUID();
    const newMessage: ChatMessage = {
      id,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      status: "delivered",
      card: customCard,
    };

    setPending((prev) => [...prev, newMessage]);
    if (customCard) {
      setCardsById((prev) => ({ ...prev, [id]: customCard }));
    }
    if (customText === undefined) setInputText("");

    // An operator typing here is a human reply, not Dara's -- actor records
    // that distinction directly on the message rather than requiring a join
    // against events to tell them apart later.
    getApi()
      .then((api) =>
        api.appendMessage({
          id,
          direction: "outbound",
          actor: "operator",
          body: textToSend,
          from: "SMTN Support",
          to: order.customers?.name || "Customer",
        }),
      )
      .catch((e: unknown) => console.log("message sync note:", e));
  };

  const headline = statusHeadline(
    activeOrder?.clearance,
    activeOrder?.orderTo?.description,
    activeOrder?.createdAt,
  );
  const trackStep = statusStep(activeOrder?.clearance);
  const orderPackages = activeOrder?.packages ?? [];
  const packageCount = orderPackages.length || 1;
  const packageWeight = orderPackages.reduce(
    (total, pkg) => total + (pkg.weight ?? 0),
    0,
  );

  const getInitials = (name?: string | null) => {
    if (!name) return "ST";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div className="flex w-full h-full bg-white dark:bg-black text-black dark:text-white overflow-hidden select-none font-sans">
      {/* ==================== LEFT: CONTACTS LIST (iMessage-style) ====================
          Always visible on desktop alongside the chat; on mobile it's the
          whole screen and swaps out for the chat once a conversation opens. */}
      <div
        className={`${
          orderId ? "hidden" : "flex"
        } lg:flex flex-col w-full lg:w-[380px] lg:shrink-0 h-full bg-white dark:bg-black lg:border-r border-gray-100 dark:border-neutral-800`}
      >
        {/* List header */}
        <div className="w-full max-w-3xl mx-auto px-4 pt-6 pb-3 flex flex-col gap-3 border-b border-gray-100 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tracking-tight text-black dark:text-white">
                Orders
              </span>
              <span className="bg-gray-100 dark:bg-neutral-800 text-black dark:text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                {ordersList.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const newOrdId = `ord-${Math.floor(10000 + Math.random() * 90000)}`;
                  navigate(`/orders/${newOrdId}`);
                }}
                title="New Order Conversation"
                className="w-9 h-9 rounded-full flex items-center justify-center bg-black dark:bg-white text-white dark:text-black hover:opacity-80 transition-opacity cursor-pointer"
              >
                <IconPlus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* iOS Style Search Bar */}
          <div className="relative w-full">
            <IconSearch className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search orders, customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 dark:bg-neutral-800 rounded-lg pl-9 pr-8 py-2 text-sm text-black dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-gray-500 hover:text-black dark:hover:text-white"
              >
                <IconX className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Orders list */}
        <div className="flex-1 overflow-y-auto scrollbar-none w-full max-w-3xl mx-auto">
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              No orders found matching "{searchQuery}"
            </div>
          ) : (
            filteredOrders.map((order) => {
              const lastReal = order.customers?.id
                ? lastMessageByCustomer.get(order.customers.id)
                : undefined;
              const lastMsg = lastReal ? toChatMessage(lastReal) : undefined;
              const isActive = order.id === activeOrder?.id;

              return (
                <div
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className={`flex items-start gap-3 px-4 py-4 cursor-pointer transition-colors border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-900 ${
                    isActive ? "bg-gray-50 dark:bg-neutral-900" : ""
                  }`}
                >
                  {/* iOS Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full bg-black dark:bg-white flex items-center justify-center text-white dark:text-black font-bold text-sm">
                      {getInitials(order.customers?.name)}
                    </div>
                    {order.clearance === "Cleared" && (
                      <span
                        style={{ backgroundColor: UBER_GREEN }}
                        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-white dark:border-black rounded-full"
                      />
                    )}
                  </div>

                  {/* Info Column */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-semibold text-black dark:text-white text-sm truncate">
                        {order.customers?.name}
                      </span>
                      <span className="text-[11px] text-gray-400 dark:text-neutral-500 shrink-0 font-medium">
                        {lastMsg?.timestamp || "Today"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-neutral-400 mb-1">

                      <span className="truncate">
                        {order.orderTo?.description || "Express Freight"}
                      </span>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-neutral-400 truncate">
                      {lastMsg?.text || "Order details & status updates"}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ==================== MAIN: CLAUDE-STYLE CHAT ====================
          Always the main pane now, not toggled behind a "Chat" button. Order
          details (ETA, route, packages, share) moved into the drawer on the
          right, popped open from the info button in the top bar. */}
      <div
        className={`${
          orderId ? "flex" : "hidden"
        } lg:flex flex-1 flex-col h-full min-w-0 bg-white dark:bg-black relative`}
      >
        {!activeOrder ? (
          <div className="hidden lg:flex flex-1 items-center justify-center text-sm text-gray-400 dark:text-neutral-600">
            Select a conversation to start chatting
          </div>
        ) : (
          <>
            {/* Top bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-neutral-800 shrink-0">
              <button
                onClick={() => navigate("/orders")}
                aria-label="All orders"
                className="lg:hidden -ml-1 shrink-0 text-black dark:text-white hover:opacity-60 transition-opacity cursor-pointer"
              >
                <IconChevronLeft className="w-6 h-6" />
              </button>
              <div className="w-9 h-9 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-xs shrink-0">
                {getInitials(activeOrder?.customers?.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-black dark:text-white text-sm truncate">
                  {activeOrder?.customers?.name || "Customer"}
                </p>
                <p className="text-xs text-gray-500 dark:text-neutral-400 truncate">
                  {headline.title}
                </p>
              </div>
              <button
                onClick={() => setShowDetails(true)}
                aria-label="Order details"
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                  showDetails
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-black dark:text-white"
                }`}
              >
                <IconInfoCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Message thread -- Claude-style: the customer's messages are
                plain text with an avatar, the operator's own are a bubble. */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-6 scrollbar-thin">
              <div className="w-full max-w-3xl mx-auto flex flex-col gap-5">
                {currentMessages.map((msg) => {
                  const isUser = msg.sender === "user";
                  const isSystem = msg.sender === "system";

                  if (isSystem && msg.card) {
                    return (
                      <div key={msg.id} className="flex flex-col items-center my-2 w-full">
                        <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-4 shadow-sm transition-all">
                          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-neutral-800">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-neutral-800 text-black dark:text-white flex items-center justify-center">
                                <IconPackage className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="font-semibold text-black dark:text-white text-sm">
                                  {msg.card.title}
                                </h4>
                                <p className="text-xs text-gray-500 dark:text-neutral-400">
                                  {msg.card.subtitle}
                                </p>
                              </div>
                            </div>
                            {msg.card.badge && (
                              <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                                {msg.card.badge}
                              </span>
                            )}
                          </div>

                          {msg.card.origin && (
                            <div className="py-3 flex items-center justify-between text-xs text-gray-600 dark:text-neutral-300 border-b border-gray-100 dark:border-neutral-800">
                              <div className="flex items-center gap-1.5">
                                <IconMapPin className="w-3.5 h-3.5 text-black dark:text-white" />
                                <span>{msg.card.origin}</span>
                              </div>
                              <IconChevronRight className="w-4 h-4 text-gray-400" />
                              <div className="flex items-center gap-1.5">
                                <IconMapPin className="w-3.5 h-3.5 text-emerald-500" />
                                <span>{msg.card.destination}</span>
                              </div>
                            </div>
                          )}

                          <div className="pt-3 flex items-center justify-between">
                            <span className="text-xs text-gray-500 dark:text-neutral-400">
                              Total Amount:
                            </span>
                            <span className="text-base font-bold text-black dark:text-white">
                              ${msg.card.amount || activeOrder?.amountTotal || 200}.00 CAD
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-neutral-500 mt-1">
                          {msg.timestamp}
                        </span>
                      </div>
                    );
                  }

                  if (isUser) {
                    // The operator's own messages: a bubble, right-aligned --
                    // same "you" convention iMessage and Claude both use.
                    return (
                      <div key={msg.id} className="flex flex-col items-end max-w-[85%] md:max-w-[75%] ml-auto">
                        <div className="relative px-4 py-2.5 text-[14px] leading-relaxed bg-black text-white dark:bg-white dark:text-black rounded-2xl rounded-br-md">
                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-400 dark:text-neutral-500 px-1">
                          <span>{msg.timestamp}</span>
                          <span style={{ color: UBER_GREEN }} className="flex items-center gap-0.5 font-medium">
                            • Delivered
                          </span>
                        </div>
                      </div>
                    );
                  }

                  // The customer's messages: plain text with an avatar, no
                  // bubble -- Claude's convention for "the other party."
                  return (
                    <div key={msg.id} className="flex items-start gap-3 max-w-[90%] md:max-w-[80%]">
                      <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-neutral-800 text-black dark:text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                        {getInitials(activeOrder?.customers?.name)}
                      </div>
                      <div className="flex flex-col items-start min-w-0">
                        <p className="text-[14px] leading-relaxed text-black dark:text-white whitespace-pre-wrap break-words">
                          {msg.text}
                        </p>
                        <span className="text-[10px] text-gray-400 dark:text-neutral-500 mt-1">
                          {msg.timestamp}
                        </span>
                      </div>
                    </div>
                  );
                })}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Action / Card Menu Popup */}
            {showCardMenu && (
              <div className="absolute bottom-20 left-4 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 shadow-xl rounded-xl p-2 z-20 flex flex-col gap-1 w-64 animate-in fade-in slide-in-from-bottom-2">
                <button
                  onClick={() => {
                    handleSendMessage("Order Status Card Sent", {
                      type: "status_update",
                      title: "Package Pre-Cleared for Shipment",
                      subtitle: "SMTN Cargo Customs Verification",
                      badge: "Cleared",
                    });
                    setShowCardMenu(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-left transition-colors"
                >
                  <IconCircleCheck className="w-4 h-4 text-emerald-500" />
                  <span>Send Customs Clearance Card</span>
                </button>
                <button
                  onClick={() => {
                    handleSendMessage("Invoice Update", {
                      type: "order_summary",
                      title: "Payment Invoice Receipt",
                      subtitle: "SMTN Cargo Air Freight",
                      amount: activeOrder?.amountTotal || 245.0,
                      badge: "Paid",
                    });
                    setShowCardMenu(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-left transition-colors"
                >
                  <IconCurrencyDollar className="w-4 h-4 text-black dark:text-white" />
                  <span>Send Invoice Receipt Card</span>
                </button>
              </div>
            )}

            {/* Composer -- Claude-style boxy rounded container, always visible */}
            <div className="px-4 md:px-6 py-4 border-t border-gray-100 dark:border-neutral-800 bg-white dark:bg-black shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="w-full max-w-3xl mx-auto flex items-center gap-2 bg-gray-100 dark:bg-neutral-900 rounded-2xl px-3 py-2 transition-all focus-within:ring-2 focus-within:ring-black/10 dark:focus-within:ring-white/20"
              >
                <button
                  type="button"
                  onClick={() => setShowCardMenu(!showCardMenu)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-black dark:text-white hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors shrink-0 cursor-pointer"
                  title="Add Order Card / Attachment"
                >
                  <IconPlus className="w-5 h-5" />
                </button>

                <input
                  ref={messageInputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Reply to this conversation"
                  className="flex-1 min-w-0 bg-transparent text-sm text-black dark:text-white placeholder:text-gray-500 outline-none py-2"
                />

                <button
                  type="button"
                  className="text-gray-500 hover:text-black dark:hover:text-white p-1 transition-colors shrink-0"
                >
                  <IconMicrophone className="w-4 h-4" />
                </button>

                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                    inputText.trim()
                      ? "bg-black text-white dark:bg-white dark:text-black hover:opacity-80"
                      : "bg-gray-200 dark:bg-neutral-800 text-gray-400 opacity-60 cursor-not-allowed"
                  }`}
                >
                  <IconSend className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        )}

        {/* ==================== RIGHT: DETAILS DRAWER ====================
            Pops out from the right on top of everything -- the ETA/route/
            packages/share content that used to be the whole main pane. */}
        {activeOrder && (
          <>
            {showDetails && (
              <div
                className="fixed inset-0 bg-black/30 z-30 lg:hidden"
                onClick={() => setShowDetails(false)}
              />
            )}
            <div
              className={`fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-white dark:bg-black border-l border-gray-100 dark:border-neutral-800 shadow-2xl transform transition-transform duration-300 ease-out flex flex-col ${
                showDetails ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-neutral-800 shrink-0">
                <span className="font-semibold text-sm text-black dark:text-white">
                  Order details
                </span>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-gray-500 hover:text-black dark:hover:text-white cursor-pointer"
                >
                  <IconX className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="relative h-36 shrink-0">
                  <RouteMap />
                </div>

                {/* ETA headline & progress */}
                <div className="px-5 py-5 border-b border-gray-100 dark:border-neutral-800">
                  <h2 className="text-xl font-bold tracking-tight text-black dark:text-white">
                    {headline.title}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">
                    {headline.sub}
                  </p>
                  <div className="flex items-center gap-1 mt-4 mb-2">
                    {TRACK_STEPS.map((stepLabel, i) => (
                      <div
                        key={stepLabel}
                        className={`h-1.5 flex-1 rounded-full ${
                          i < trackStep ? "bg-black dark:bg-white" : "bg-gray-200 dark:bg-neutral-800"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs font-medium text-gray-500 dark:text-neutral-400">
                    {TRACK_STEPS[Math.min(trackStep, TRACK_STEPS.length) - 1]}
                  </p>
                </div>

                {/* Customer */}
                <div className="px-5 py-5 border-b border-gray-100 dark:border-neutral-800 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-sm shrink-0">
                    {getInitials(activeOrder?.customers?.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-black dark:text-white text-[15px] truncate">
                      {activeOrder?.customers?.name || "Customer"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-neutral-400 truncate mt-0.5">
                      {activeOrder?.customers?.phone || "+1 (800) SMTN-CARGO"}
                    </p>
                  </div>
                </div>

                {/* Route */}
                <div className="px-5 py-5 border-b border-gray-100 dark:border-neutral-800 flex gap-4">
                  <div className="flex flex-col items-center pt-1.5 shrink-0">
                    <span className="w-2.5 h-2.5 bg-black dark:bg-white" />
                    <span className="flex-1 w-px border-l border-dashed border-gray-300 dark:border-neutral-700 my-2" />
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-black dark:border-white" />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-6">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500 mb-1.5">
                        Pickup
                      </p>
                      <p className="text-sm text-black dark:text-white truncate">
                        {activeOrder?.orderFrom?.description || "Origin"}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500 mb-1.5">
                        Dropoff
                      </p>
                      <p className="text-sm text-black dark:text-white truncate">
                        {activeOrder?.orderTo?.description || "Destination"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Packages & total */}
                <div className="px-5 py-5 border-b border-gray-100 dark:border-neutral-800 flex flex-col gap-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500">
                      Packages
                    </span>
                    <span className="text-sm text-black dark:text-white">
                      {packageCount}
                      {packageWeight > 0 ? ` · ${packageWeight} kg` : ""}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500">
                      Total
                    </span>
                    <span className="text-sm font-semibold text-black dark:text-white">
                      ${activeOrder?.amountTotal || 200}.00 CAD
                    </span>
                  </div>
                </div>

                {/* Share */}
                <div className="px-5 py-5">
                  <button
                    onClick={async () => {
                      if (!activeOrder) return;
                      try {
                        const api = await getApi();
                        const { token } = await api.createTrackingLink(activeOrder.id);
                        const url = `${window.location.origin}/orders/${activeOrder.id}?t=${token}`;
                        await navigator.clipboard.writeText(url);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      } catch (e) {
                        console.error("Could not create tracking link:", e);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-black dark:text-white transition-colors cursor-pointer text-sm font-medium"
                  >
                    <IconShare className="w-4 h-4" />
                    {linkCopied ? "Link copied!" : "Share tracking link"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Read-only: a customer with a link, no account. Deliberately minimal --
// status, route, packages, and the conversation history, no compose box.
// Replying happens over SMS, which is the only channel this system actually
// answers on today; a web reply box would need its own delivery pipeline
// into Dara, which doesn't exist yet.
const PublicOrderTracking = ({
  orderId,
  token,
}: {
  orderId: string;
  token: string;
}) => {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; order: OrderView; thread: MessageView[] }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    publicApi()
      .trackOrder(orderId, token)
      .then(({ order, thread }) => {
        if (!cancelled) setState({ status: "ready", order, thread });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, token]);

  if (state.status === "loading") {
    return (
      <div className="flex w-full h-full items-center justify-center bg-white dark:bg-black">
        <div className="w-8 h-8 border-4 border-gray-200 dark:border-neutral-700 border-t-black dark:border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex w-full h-full items-center justify-center bg-white dark:bg-black p-6">
        <div className="flex flex-col items-center gap-2 text-center max-w-sm">
          <p className="font-semibold text-black dark:text-white">
            Can't open this tracking link
          </p>
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            {state.message}
          </p>
        </div>
      </div>
    );
  }

  const { order, thread } = state;
  const headline = statusHeadline(
    order.clearance,
    order.orderTo?.description,
    order.createdAt,
  );
  const trackStep = statusStep(order.clearance);
  const packages = order.packages ?? [];
  const packageCount = packages.length || 1;
  const packageWeight = packages.reduce(
    (total, pkg) => total + (pkg.weight ?? 0),
    0,
  );

  return (
    <div className="flex w-full h-full bg-white dark:bg-black text-black dark:text-white overflow-hidden font-sans">
      <div className="relative h-[36%] min-h-50 shrink-0 lg:absolute lg:inset-0 lg:h-full lg:min-h-0 w-full">
        <RouteMap />
      </div>

      <div className="relative flex-1 flex flex-col min-h-0 -mt-5 bg-white dark:bg-black rounded-t-2xl shadow-[0_-6px_20px_rgba(0,0,0,0.12)] lg:absolute lg:left-6 lg:top-6 lg:bottom-6 lg:mt-0 lg:w-100 lg:rounded-2xl lg:shadow-xl lg:overflow-y-auto z-10">
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-gray-200 dark:bg-neutral-700 lg:hidden" />

        <div className="px-5 pt-3 lg:pt-5 pb-4">
          <h2 className="text-[26px] leading-[1.15] font-bold tracking-tight truncate">
            {headline.title}
          </h2>
          <p className="text-sm text-gray-500 dark:text-neutral-400 truncate mt-1">
            {headline.sub}
          </p>

          <div className="flex items-center gap-1 mt-4 mb-2">
            {TRACK_STEPS.map((stepLabel, i) => (
              <div
                key={stepLabel}
                className={`h-1.5 flex-1 rounded-full ${
                  i < trackStep ? "bg-black dark:bg-white" : "bg-gray-200 dark:bg-neutral-800"
                }`}
              />
            ))}
          </div>
          <p className="text-xs font-medium text-gray-500 dark:text-neutral-400">
            {TRACK_STEPS[Math.min(trackStep, TRACK_STEPS.length) - 1]}
          </p>
        </div>

        <div className="px-5 py-5 border-t border-gray-100 dark:border-neutral-800 flex gap-4">
          <div className="flex flex-col items-center pt-1.5 shrink-0">
            <span className="w-2.5 h-2.5 bg-black dark:bg-white" />
            <span className="flex-1 w-px border-l border-dashed border-gray-300 dark:border-neutral-700 my-2" />
            <span className="w-2.5 h-2.5 rounded-full border-2 border-black dark:border-white" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-6">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500 mb-1.5">
                Pickup
              </p>
              <p className="text-sm truncate">
                {order.orderFrom?.description || "Origin"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500 mb-1.5">
                Dropoff
              </p>
              <p className="text-sm truncate">
                {order.orderTo?.description || "Destination"}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 border-t border-gray-100 dark:border-neutral-800 flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500">
              Packages
            </span>
            <span className="text-sm">
              {packageCount}
              {packageWeight > 0 ? ` · ${packageWeight} kg` : ""}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500">
              Total
            </span>
            <span className="text-sm font-semibold">
              ${order.amountTotal ?? 200}.00 CAD
            </span>
          </div>
        </div>

        {thread.length > 0 && (
          <div className="px-5 py-5 border-t border-gray-100 dark:border-neutral-800 flex flex-col gap-3">
            <span className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500">
              Updates
            </span>
            {thread.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.direction === "outbound" ? "items-start" : "items-end"
                }`}
              >
                <div
                  className={`max-w-[85%] px-4 py-2.5 text-[14px] leading-relaxed rounded-2xl ${
                    m.direction === "outbound"
                      ? "bg-gray-100 dark:bg-neutral-800 rounded-bl-md"
                      : "bg-black text-white dark:bg-white dark:text-black rounded-br-md"
                  }`}
                >
                  <p className="whitespace-pre-wrap wrap-break-word">{m.body}</p>
                </div>
                <span className="text-[10px] text-gray-400 dark:text-neutral-500 mt-1 px-1">
                  {m.createdAt
                    ? new Date(m.createdAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// The route's actual entry point. A tracking token in the URL means a
// customer with a link and no account -- render the read-only view with no
// auth check at all. Its absence means staff, gated the same way /dashboard
// is.
export const Orders = () => {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t");

  if (orderId && token) {
    return <PublicOrderTracking orderId={orderId} token={token} />;
  }

  return (
    <RequireTenant>
      <StaffOrders />
    </RequireTenant>
  );
};

export default Orders;
