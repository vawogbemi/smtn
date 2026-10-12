import { useContext, useMemo, useState } from "react";
import {
  OverlayTriggerStateContext,
  TextField,
  type OverlayTriggerState,
} from "react-aria-components";
import { Tab, TabList, Tabs } from "@react-spectrum/s2";
import { IconAlertCircle, IconMessage, IconSend, IconUsers } from "@tabler/icons-react";
import { Button } from "./Button";
import { Description, Label, TextArea } from "./Field";
import { useQuery, useTenantApi } from "../data";

const TEMPLATES = [
  {
    id: "pickup",
    label: "Ready for Pickup",
    body:
      "Hello {name}, your package has arrived at our office and is ready for pickup. - SMTN Cargo",
  },
  {
    id: "transit",
    label: "In Transit",
    body:
      "Hello {name}, your shipment is in transit and on its way. We will let you know as soon as it arrives. - SMTN Cargo",
  },
  { id: "custom", label: "Custom", body: "" },
];

export const SendMessage = (
  { orderIds = [], onDone }: { orderIds?: string[]; onDone?: () => void },
) => {
  const overlay = useContext<OverlayTriggerState | null>(
    OverlayTriggerStateContext,
  );
  const close = () => {
    overlay?.close();
    onDone?.();
  };

  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [body, setBody] = useState(TEMPLATES[0].body);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const getApi = useTenantApi();
  const { data: orders, isLoading, error: ordersError } = useQuery("ordersByIds", orderIds);

  const recipients = useMemo(() => {
    const byPhone = new Map<string, { name: string; phone: string }>();
    for (const order of orders ?? []) {
      const customer = order.customers;
      if (customer?.phone && !byPhone.has(customer.phone)) {
        byPhone.set(customer.phone, {
          name: String(customer.name ?? ""),
          phone: customer.phone,
        });
      }
    }
    return [...byPhone.values()];
  }, [orders]);

  const example = body.replaceAll(
    "{name}",
    recipients[0]?.name || "there",
  );

  return (
    <div className="flex h-full w-full flex-col gap-5 overflow-y-auto rounded-2xl bg-surface p-5 md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IconMessage size={20} />
          </span>
          <div>
            <p className="text-lg font-semibold text-text-primary">Send a customer update</p>
            <p className="mt-1 text-sm text-text-secondary">
              Personalize an SMS for customers on the selected orders.
            </p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-alt px-3 py-1.5 text-xs font-medium text-text-secondary">
          <IconUsers size={14} />
          {isLoading ? "Loading…" : `${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {recipients.length > 0 && (
        <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-surface-alt px-3 py-2.5">
          <IconUsers size={16} className="shrink-0 text-text-muted" />
          <p className="truncate text-xs text-text-secondary">
            Sending to {recipients.slice(0, 3).map((recipient) => recipient.name || recipient.phone).join(", ")}
            {recipients.length > 3 ? ` + ${recipients.length - 3} more` : ""}
          </p>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Choose a starting point
            </p>
            <Tabs
              aria-label="Message template"
              density="compact"
              selectedKey={templateId}
              onSelectionChange={(key: React.Key) => {
                const template = TEMPLATES.find((t) => t.id === key);
                setTemplateId(String(key));
                if (template) setBody(template.body);
                setSendError(null);
              }}
              UNSAFE_className="w-full"
            >
              <TabList>
                {TEMPLATES.map((template) => (
                  <Tab key={template.id} id={template.id}>
                    {template.label}
                  </Tab>
                ))}
              </TabList>
            </Tabs>
          </div>

          <TextField
            aria-label="Message template"
            className="flex min-h-52 flex-1 flex-col gap-3 rounded-xl border border-border bg-surface p-4 focus-within:border-primary/50"
            value={body}
            onChange={(value: string) => {
              setBody(value);
              setSendError(null);
            }}
          >
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-text-primary">Message</Label>
              <span className="text-xs text-text-muted">{body.length} characters</span>
            </div>
            <TextArea
              rows={6}
              placeholder="Write your message…"
              className="min-h-32 flex-1 resize-y border-0 bg-transparent px-0 py-0 text-sm leading-6 outline-none shadow-none focus:ring-0"
            />
            <Description className="text-xs text-text-muted">
              Use {"{name}"} to personalize each message.
            </Description>
          </TextField>
        </div>

        <section className="flex min-h-60 flex-col rounded-xl border border-border bg-surface-alt p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">Message preview</p>
              <p className="mt-1 text-xs text-text-muted">Example for {recipients[0]?.name || "your customer"}</p>
            </div>
            <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary">
              SMS
            </span>
          </div>
          <div className="my-auto py-6">
            <div className="mb-2 flex items-center gap-2 text-xs text-text-muted">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                <IconMessage size={13} />
              </span>
              SMTN Cargo
            </div>
            <div className="max-w-[92%] whitespace-pre-wrap wrap-break-word rounded-2xl rounded-bl-md bg-primary px-4 py-3 text-sm leading-5 text-white shadow-sm">
              {example || <span className="italic opacity-70">Your message preview will appear here</span>}
            </div>
            <p className="mt-2 pl-2 text-[10px] text-text-muted">Just now</p>
          </div>
          <p className="text-xs leading-5 text-text-muted">
            Review the recipients and message before sending. Customers can reply by SMS.
          </p>
        </section>
      </div>

      {(sendError || ordersError || (!isLoading && recipients.length === 0)) && (
        <div
          role="alert"
          className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
            sendError || ordersError
              ? "border border-red-500/20 bg-red-500/5 text-red-700"
              : "border border-border bg-surface-alt text-text-secondary"
          }`}
        >
          <IconAlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>
            {sendError ??
              (ordersError
                ? "Could not load the selected orders. Please try again."
                : "No customers with a phone number are attached to these orders.")}
          </span>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-text-muted">
          {recipients.length} customer{recipients.length === 1 ? "" : "s"} will receive an individual SMS.
        </p>
        <div className="flex items-center justify-end gap-3">
        <Button variant="secondary" onPress={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          isPending={isSending}
          isDisabled={isLoading || !!ordersError || recipients.length === 0 || body.trim().length === 0}
          onPress={async () => {
            if (isSending || recipients.length === 0 || !body.trim()) return;
            setIsSending(true);
            setSendError(null);
            try {
              const result = await (await getApi()).sendMessage(
                recipients.map((r) => ({
                  to: r.phone,
                  body: body.replaceAll("{name}", r.name),
                })),
              );
              if (result.failed > 0) {
                setSendError(
                  `${result.sent} message${result.sent === 1 ? "" : "s"} sent; ${result.failed} failed. Check your messaging setup before retrying to avoid sending duplicates.`,
                );
                return;
              }
              close();
            } catch (e) {
              console.error("sendMessage failed:", e);
              setSendError(
                e instanceof Error
                  ? `Messages could not be sent: ${e.message}`
                  : "Messages could not be sent. Please try again.",
              );
            } finally {
              setIsSending(false);
            }
          }}
        >
          <IconSend size={16} />
          Send update
        </Button>
        </div>
      </div>
    </div>
  );
};

export default SendMessage;
