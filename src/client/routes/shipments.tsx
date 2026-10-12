import {
  TextField,
  Table,
  TableHeader,
  Column,
  TableBody,
  Row,
  Cell,
  DropZone,
  FileTrigger,
  type DropItem,
  type DropZoneProps,
  type DropZoneRenderProps,
} from "react-aria-components";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router";
import { Form } from "@react-spectrum/s2";
import { Button } from "../components/Button";
import { TextArea } from "../components/Field";
import {
  IconChevronLeft,
  IconFileText,
  IconInbox,
  IconTable,
  IconPlus,
  IconSend,
  IconSparkles,
} from "@tabler/icons-react";
import { GridList, GridListItem } from "../components/GridList";
import { Card } from "../components/Card";
import ImportShipment, {
  PENDING_IMPORT_DRAFT_KEY,
  readPendingImportDraft,
  type ShipmentImportDraft,
} from "../components/ImportShipment";
import { refetchAll, useQuery, useTenantApi } from "../data";

export const DEFAULT_SHIPMENT_TITLE = "New Shipment";

const naturalCompare = (a: unknown, b: unknown) => {
  const chunks = (n: unknown) => String(n ?? "").match(/\d+|\D+/g) ?? [];
  const ca = chunks(a);
  const cb = chunks(b);
  for (let i = 0; i < Math.max(ca.length, cb.length); i++) {
    const x = ca[i] ?? "";
    const y = cb[i] ?? "";
    const isNum = /^\d+$/.test(x) && /^\d+$/.test(y);
    const diff = isNum ? parseInt(x, 10) - parseInt(y, 10) : x.localeCompare(y);
    if (diff !== 0) return diff;
  }
  return 0;
};

// The shipment workspace is the dashboard's primary page and import entry point.
export const Shipments = () => {
  const navigate = useNavigate();
  const { shipmentId } = useParams();
  const getApi = useTenantApi();
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [showTable, setShowTable] = useState(true);
  const [tableExpanded, setTableExpanded] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const clearFileToUpload = useCallback(() => setFileToUpload(null), []);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const { data: shipments = [], isLoading: shipmentsLoading } =
    useQuery("listShipments");
  const [pendingImportDraft] = useState<ShipmentImportDraft | null>(
    readPendingImportDraft,
  );
  useEffect(() => {
    try {
      sessionStorage.removeItem(PENDING_IMPORT_DRAFT_KEY);
    } catch (error) {
      console.error("Could not clear the pending shipment import draft:", error);
    }
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeStart.current) return;
      const maxWidth = Math.min(416, window.innerWidth * 0.36);
      const nextWidth =
        resizeStart.current.width + event.clientX - resizeStart.current.x;
      setSidebarWidth(Math.max(240, Math.min(maxWidth, nextWidth)));
    };
    const handlePointerUp = () => {
      resizeStart.current = null;
      setIsResizingSidebar(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingSidebar]);

  const adjustSidebarWidth = (amount: number) => {
    const maxWidth = Math.min(416, window.innerWidth * 0.36);
    setSidebarWidth((width) =>
      Math.max(240, Math.min(maxWidth, width + amount))
    );
  };

  if (shipmentId) {
    return (
      <div className="flex w-full h-full">
        <Outlet />
      </div>
    );
  }

  return (
    <main className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#f7f6f2] font-sans text-[#282724] md:flex-row">
      <aside
        style={{ "--shipment-sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
        className={`relative flex w-full shrink-0 flex-col border-b border-[#e3e1da] bg-[#f2f1ed] md:w-(--shipment-sidebar-width) md:border-b-0 md:border-r ${
          isResizingSidebar ? "select-none" : ""
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 md:justify-start md:gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src="https://public.smtncargo.com/smtnlogo.jpg"
              alt="SMTN"
              className="h-8 w-8 object-contain"
            />
            <span className="text-sm font-semibold tracking-tight">SMTN</span>
          </Link>
          <Link
            to="/"
            aria-label="Start a new shipment"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#77756e] transition hover:bg-white hover:text-[#282724] md:hidden"
          >
            <IconPlus size={18} />
          </Link>
        </div>

        <div className="flex gap-1 px-3 pb-3 md:flex-col">
          <Link
            to="/"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[#55534d] transition hover:bg-white md:flex-none"
          >
            <IconPlus size={16} />
            <span className="truncate">New shipment</span>
          </Link>
          <Link
            to="/dashboard/orders"
            className="hidden items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[#77756e] transition hover:bg-white hover:text-[#282724] md:flex"
          >
            <IconInbox size={16} />
            Orders
          </Link>
        </div>

        <div className="hidden min-h-0 flex-1 flex-col border-t border-[#e3e1da] px-3 py-4 md:flex">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#929087]">
            Shipments
          </p>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {shipmentsLoading ? (
              <p className="px-3 py-2 text-xs text-[#929087]">
                Loading shipments…
              </p>
            ) : shipments.length ? (
              shipments.map((shipment) => (
                <Link
                  key={shipment.id}
                  to={`/shipments/${shipment.id}`}
                  className="flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#55534d] transition hover:bg-white hover:text-[#282724]"
                >
                  <IconFileText size={15} className="shrink-0 text-[#929087]" />
                  <span className="truncate">
                    {shipment.title || DEFAULT_SHIPMENT_TITLE}
                  </span>
                </Link>
              ))
            ) : (
              <p className="px-3 py-2 text-xs leading-5 text-[#929087]">
                Your created shipments will appear here.
              </p>
            )}
          </div>
        </div>

        <div
          role="separator"
          aria-label="Resize shipment sidebar"
          aria-orientation="vertical"
          aria-valuemin={240}
          aria-valuemax={416}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            event.preventDefault();
            resizeStart.current = { x: event.clientX, width: sidebarWidth };
            setIsResizingSidebar(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              adjustSidebarWidth(-16);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              adjustSidebarWidth(16);
            }
          }}
          className="absolute -right-1.5 top-0 z-20 hidden h-full w-3 cursor-col-resize touch-none md:block"
        />
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[#f7f6f2] xl:flex-row xl:overflow-hidden">
        <section className="order-1 flex min-h-120 min-w-0 flex-[1.1] basis-0 flex-col overflow-y-auto px-2 py-1 sm:px-2 xl:order-1 xl:min-h-0">
        
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col pt-5">
          <div className="flex min-h-0 flex-1 flex-col">
            <AgentChat getApi={getApi} onFileUpload={setFileToUpload} />
          </div>
        </div>
      </section>

      {showTable ? (
        <section
          className={`order-2 flex min-h-120 min-w-0 flex-1 basis-0 items-stretch justify-center px-2 py-[2.5vh] xl:order-2 xl:min-h-0 xl:px-3 ${
            tableExpanded
              ? "absolute inset-3 z-50 m-0! h-auto! w-auto! max-w-none! bg-[#f7f6f2] p-0"
              : ""
          }`}
        >
          <div className="h-full min-h-80 w-full">
            <ImportShipment
              initialDraft={pendingImportDraft}
              fileToUpload={fileToUpload}
              onFileHandled={clearFileToUpload}
              isExpanded={tableExpanded}
              onExpand={() => setTableExpanded((expanded) => !expanded)}
              onClose={() => {
                setTableExpanded(false);
                setShowTable(false);
              }}
            />
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setShowTable(true)}
          aria-label="Show shipment table"
          title="Show shipment table"
          className="absolute right-4 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-[#e3e1da] bg-white text-[#55534d] shadow-sm transition hover:bg-[#faf9f6]"
        >
          <IconTable size={18} />
        </button>
      )}
      </div>
    </main>
  );
};

type AgentApi = Awaited<ReturnType<ReturnType<typeof useTenantApi>>>;
type DropEvent = Parameters<NonNullable<DropZoneProps["onDrop"]>>[0];

function AgentChat({
  getApi,
  onFileUpload,
}: {
  getApi: () => Promise<AgentApi>;
  onFileUpload: (file: File) => void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const task = input.trim();
    if (!task || isSending) return;

    setInput("");
    setError(null);
    setIsSending(true);
    setMessages((current) => [...current, { role: "user", text: task }]);
    try {
      const response = await (await getApi()).runAgentTask(task);
      if (!response.ok) throw new Error(response.error);
      setMessages((current) => [
        ...current,
        { role: "assistant", text: response.text },
      ]);
    } catch (cause) {
      console.error("Dara shipment chat failed:", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Dara could not respond. Please try again.",
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-5">
        {messages.length === 0 ? (
          <div className="m-auto max-w-sm px-4 text-center">
            <IconSparkles size={22} className="mx-auto text-[#929087]" />
            <p className="mt-3 text-sm font-medium">What can I help with?</p>
            <p className="mt-2 text-sm leading-6 text-[#77756e]">
              Ask Dara to help with shipments, packages, or customer updates.
            </p>
            <DropZone
              onDrop={async (event: DropEvent) => {
                const item = event.items.find(
                  (candidate: DropItem) => candidate.kind === "file",
                );
                if (item?.kind === "file") onFileUpload(await item.getFile());
              }}
              className={({ isDropTarget }: DropZoneRenderProps) =>
                `mt-4 w-full rounded-xl transition ${
                  isDropTarget ? "ring-2 ring-primary ring-offset-2" : ""
                }`
              }
            >
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#d8d5cc] bg-white/70 px-3 py-2.5 text-left transition hover:border-[#bcb8ad]">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-[#55534d]">
                    Drop a shipment file here
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#929087]">
                    CSV, Excel, or DOCX
                  </p>
                </div>
                <FileTrigger
                  acceptedFileTypes={[".csv", ".xlsx", ".docx"]}
                  onSelect={(files) => {
                    const file = files?.[0];
                    if (file) onFileUpload(file);
                  }}
                >
                  <Button variant="secondary" className="shrink-0 px-3 py-1.5 text-xs">
                    Browse
                  </Button>
                </FileTrigger>
              </div>
            </DropZone>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${index}-${message.role}`}
              className={`max-w-[90%] whitespace-pre-wrap wrap-break-word text-sm leading-6 ${
                message.role === "user"
                  ? "ml-auto rounded-2xl bg-[#eeece6] px-4 py-2.5 text-[#34332f]"
                  : "text-[#34332f]"
              }`}
            >
              {message.role === "assistant" && (
                <p className="mb-1 text-xs font-semibold text-[#77756e]">Dara</p>
              )}
              {message.text}
            </div>
          ))
        )}
        {isSending && (
          <p className="text-sm text-[#929087]">Dara is thinking…</p>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm leading-5 text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={send}
        className="flex items-end gap-2 rounded-2xl border border-[#e3e1da] bg-white p-2 shadow-[0_2px_10px_rgba(54,50,40,0.04)] focus-within:border-[#c7c2b6]"
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          aria-label="Message Dara"
          placeholder="Ask Dara about shipments…"
          maxLength={4000}
          rows={2}
          disabled={isSending}
          className="max-h-36 min-h-10 flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-5 text-[#34332f] outline-none placeholder:text-[#a8a69e] disabled:opacity-60"
        />
        <Button
          type="submit"
          aria-label="Send message to Dara"
          isDisabled={!input.trim() || isSending}
          className="mb-0.5 shrink-0 rounded-lg bg-[#282724] text-white hover:bg-[#44423d]"
        >
          <IconSend size={16} />
        </Button>
      </form>
      <p className="mt-2 text-center text-[11px] leading-4 text-[#929087]">
        Dara can make mistakes. Review important shipment changes.
      </p>
    </>
  );
}

const syncTitleField = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
  const isDefault = el.value === DEFAULT_SHIPMENT_TITLE;
  el.classList.toggle("text-text-muted", isDefault);
  el.classList.toggle("text-text-primary", !isDefault);
};

export const Shipment = () => {
  const navigate = useNavigate();
  const { shipmentId } = useParams();
  const getApi = useTenantApi();

  const { isLoading, error, data: shipment } = useQuery(
    "getShipment",
    shipmentId ?? "",
  );

  if (isLoading) {
    return <div></div>;
  }

  if (error) {
    return (
      <div className="text-primary">
        An error occurred, please try again later
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="flex w-full h-full px-3 pb-3 items-center justify-center">
        <p>Shipment not Found</p>
      </div>
    );
  }

  const orders = shipment.orders;

  return (
    <div className="flex flex-col w-full h-full min-h-0 px-4 md:px-8 pb-5">
      <div className="h-13 pt-3 pb-3 flex items-center shrink-0">
        <Button
          variant="quiet"
          aria-label="Back to activity"
          className="rounded-full shrink-0"
          onPress={() => navigate("/shipments")}
        >
          <IconChevronLeft className="h-4 w-4" />
        </Button>
      </div>
      <Form
        UNSAFE_className="w-full pt-6 pb-2 flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const value =
            new FormData(e.currentTarget).get("title")?.toString().trim() ?? "";
          if (value !== shipment.title) {
            await (await getApi()).updateShipmentTitle(shipment.id, value);
            refetchAll();
          }
          (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <TextField
          key={`${shipmentId}:${shipment.title ?? ""}`}
          name="title"
          defaultValue={shipment?.title}
          aria-label="Shipment title"
          className="w-full"
        >
          <TextArea
            ref={syncTitleField}
            onInput={(e) => syncTitleField(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Untitled"
            rows={1}
            className="w-full min-h-10 md:min-h-16 mb-2 md:mb-0 px-0 py-0 border-0 outline-none bg-transparent shadow-none resize-none overflow-hidden [hyphens:none] [-webkit-hyphens:none] text-2xl md:text-4xl font-bold leading-tight placeholder:text-text-muted focus:outline-none focus:ring-0"
          />
        </TextField>
      </Form>
      <Card title="Orders" className="flex-1">
        <GridList
          aria-label="Orders"
          selectionMode="multiple"
          items={[...orders].sort((a, b) => {
            const minNumber = (o: typeof a) =>
              o.packages.reduce<unknown>(
                (min, p) =>
                  min === undefined || naturalCompare(p.number, min) < 0
                    ? p.number
                    : min,
                undefined,
              );
            return naturalCompare(minNumber(a), minNumber(b));
          })}
          renderEmptyState={() => (
            <div className="flex w-full items-center justify-center py-12 text-sm italic text-text-muted">
              No orders found
            </div>
          )}
          className="**:[[role=option]]:h-18 flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden p-1"
        >
          {(order) => (
            <GridListItem
              id={order.id}
              textValue={order.orderTo?.description ?? order.id}
              modalContent={
                <div className="w-full h-full min-h-64 bg-surface p-4 md:p-6 flex flex-col gap-2">
                  <div className="font-semibold text-text-primary text-lg md:text-2xl flex flex-col gap-1 md:flex-row md:justify-between">
                    <p className="min-w-0 wrap-break-word">
                      {order.orderTo?.description} ←{" "}
                      {order.orderFrom?.description}
                    </p>
                    <p className="shrink-0">
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString()
                        : ""}
                    </p>
                  </div>
                  <div className="w-full overflow-x-auto rounded-lg border border-border">
                  <Table
                    aria-label="Files"
                    selectionMode="none"
                    className="w-full min-w-max text-sm"
                  >
                    <TableHeader className="bg-surface-alt text-text-secondary">
                      <Column
                        id="number"
                        isRowHeader
                        className="font-medium text-center px-3 py-2"
                      >
                        Number
                      </Column>
                      <Column
                        id="length"
                        className="text-center px-3 py-2font-medium"
                      >
                        Length
                      </Column>
                      <Column
                        id="width"
                        className="text-center px-3 py-2font-medium"
                      >
                        Width
                      </Column>
                      <Column
                        id="height"
                        className="text-center px-3 py-2 font-medium"
                      >
                        Height
                      </Column>
                      <Column
                        id="weight"
                        className="text-center px-3 py-2 font-medium"
                      >
                        Weight
                      </Column>
                    </TableHeader>
                    <TableBody
                      renderEmptyState={() => (
                        <span className="flex px-3 py-4 text-text-muted italic justify-center">
                          No packages found
                        </span>
                      )}
                    >
                      {order.packages.map((p) => (
                        <Row id={p.id}>
                          <Cell className="text-center px-3 py-2">
                            {p.number}
                          </Cell>
                          <Cell className="text-center px-3 py-2">
                            {p.length}
                          </Cell>
                          <Cell className="text-center px-3 py-2">
                            {p.width}
                          </Cell>
                          <Cell className="text-center px-3 py-2">
                            {p.height}
                          </Cell>
                          <Cell className="text-center px-3 py-2">
                            {p.weight}
                          </Cell>
                        </Row>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                </div>
              }
            >
              <div className="w-full min-w-0 px-3 md:px-6 flex flex-row items-center justify-start">
                <div className="flex items-center gap-3 md:gap-5 min-w-0 w-full">
                  <p className="font-light text-text-primary text-sm md:text-base shrink-0">
                    {order.customers?.name}
                  </p>
                  <p className="font-light text-text-primary text-sm md:text-base truncate min-w-0">
                    {order.orderTo?.description} ←{" "}
                    {order.orderFrom?.description}
                  </p>
                </div>
              </div>
            </GridListItem>
          )}
        </GridList>
      </Card>
    </div>
  );
};
