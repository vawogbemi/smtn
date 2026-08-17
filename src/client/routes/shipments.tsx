import {
  TextField,
  Table,
  TableHeader,
  Column,
  TableBody,
  Row,
  Cell,
} from "react-aria-components";
import { Outlet, useNavigate, useParams } from "react-router";
import { Form } from "@react-spectrum/s2";
import { Button } from "../components/Button";
import { TextArea } from "../components/Field";
import { IconChevronLeft, IconPlus } from "@tabler/icons-react";
import { GridList, GridListItem } from "../components/GridList";
import { Card } from "../components/Card";
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

// Shipments are reached from the activity feed, so this route is just a frame
// for the detail; landing on it without an id offers a way to start one.
export const Shipments = () => {
  const navigate = useNavigate();
  const { shipmentId } = useParams();
  const getApi = useTenantApi();

  if (shipmentId) {
    return (
      <div className="flex w-full h-full">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex w-full h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm italic text-text-muted">No shipment selected</p>
        <Button
          onPress={async () => {
            const newShipmentId = await (
              await getApi()
            ).createShipment(DEFAULT_SHIPMENT_TITLE);
            navigate(`/dashboard/shipments/${newShipmentId}`);
          }}
        >
          <IconPlus className="h-4 w-4" />
          New shipment
        </Button>
      </div>
    </div>
  );
};

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
          onPress={() => navigate("/dashboard")}
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
