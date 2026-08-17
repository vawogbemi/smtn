import { useContext, useMemo, useState } from "react";
import {
  OverlayTriggerStateContext,
  TextField,
} from "react-aria-components";
import { Tab, TabList, Tabs } from "@react-spectrum/s2";
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
  const overlay = useContext(OverlayTriggerStateContext);
  const close = () => {
    overlay?.close();
    onDone?.();
  };

  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [body, setBody] = useState(TEMPLATES[0].body);
  const [isSending, setIsSending] = useState(false);

  const getApi = useTenantApi();
  const { data: orders } = useQuery("ordersByIds", orderIds);

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
    recipients[0]?.name || "John Doe",
  );

  return (
    <div className="flex w-full h-full flex-col gap-4 rounded-xl bg-surface p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-text-primary text-lg">Send Message</p>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
        </span>
      </div>

      <Tabs
        aria-label="Message template"
        density="compact"
        selectedKey={templateId}
        onSelectionChange={(key) => {
          const template = TEMPLATES.find((t) => t.id === key);
          setTemplateId(String(key));
          if (template) setBody(template.body);
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

      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
        {/* Preview */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 rounded-xl border border-primary/20 bg-linear-to-br from-primary/10 via-surface-alt to-accent/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Preview
          </p>
          <div className="my-auto flex flex-col gap-1 py-2">
            <span className="pl-1 text-xs text-text-muted">SMTN Cargo</span>
            <div className="w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-primary px-4 py-2.5 text-sm text-white shadow-sm">
              {example || (
                <span className="italic opacity-70">
                  Your message preview will appear here
                </span>
              )}
            </div>
            <span className="pl-1 text-[10px] text-text-muted">now · SMS</span>
          </div>
        </div>

        {/* Editor */}
        <TextField
          aria-label="Message template"
          className="flex-1 min-w-0 flex flex-col gap-3 rounded-xl border border-primary/20 bg-linear-to-br from-primary/10 via-surface-alt to-accent/10 p-4"
          value={body}
          onChange={setBody}
        >
          <Label className="text-xs font-semibold uppercase tracking-wide text-primary">
            Message
          </Label>
          <TextArea
            rows={6}
            placeholder="Write your message…"
            className="flex-1 min-h-0 resize-none border-0 bg-transparent px-0 py-0 outline-none shadow-none focus:ring-0"
          />
          <Description className="text-xs text-text-muted">
            Use {"{name}"} to insert each customer's name.
          </Description>
        </TextField>
      </div>

      <div className="mt-auto flex items-center justify-end gap-3">
        <Button variant="secondary" onPress={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          isPending={isSending}
          isDisabled={recipients.length === 0 || body.trim().length === 0}
          onPress={async () => {
            if (isSending) return;
            setIsSending(true);
            try {
              await (await getApi()).sendMessage(
                recipients.map((r) => ({
                  to: r.phone,
                  body: body.replaceAll("{name}", r.name),
                })),
              );
              close();
            } catch (e) {
              console.error("sendMessage failed:", e);
            } finally {
              setIsSending(false);
            }
          }}
        >
          Send
        </Button>
      </div>
    </div>
  );
};

export default SendMessage;
