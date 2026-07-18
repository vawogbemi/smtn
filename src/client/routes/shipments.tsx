import {
  ListBox,
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
import { db, id } from "../../instant";
import { ListBoxItem } from "../components/ListBox";
import { Button } from "../components/Button";
import { TextArea } from "../components/Field";
import schema from "../../instant.schema";
import { InstaQLEntity } from "@instantdb/react";
import {
  IconFilter2,
  IconAdjustmentsHorizontal,
  IconChevronLeft,
  IconPlus,
} from "@tabler/icons-react";
import { GridList, GridListItem } from "../components/GridList";

type Shipments = InstaQLEntity<typeof schema, "shipments">;

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

export const Shipments = () => {
  const navigate = useNavigate();
  const { shipmentId } = useParams();

  const { isLoading, error, data } = db.useQuery({
    shipments: {
      $: {
        order: {
          serverCreatedAt: "desc",
        },
      },
    },
  });

  if (isLoading) {
    return (
      <div className="w-8 h-8 border-4 border-spinner border-t-transparent rounded-full animate-spin my-auto"></div>
    );
  }

  if (error) {
    return (
      <div className="text-primary">
        An error occurred, please try again later
      </div>
    );
  }

  const { shipments } = data;
  const shipment = shipments.find((sh) => sh.id === shipmentId);

  return (
    <div className="flex w-full h-full">
      <div
        className={`${
          shipmentId ? "hidden md:flex" : "flex"
        } flex-col w-full md:w-[max(20%,300px)] h-full pt-3 gap-1 md:border-r-7 border-surface`}
      >
        <div className="h-10 border-b-7 border-surface px-5 pb-3 -mr-1.75 flex items-center justify-between">
          <p className="font-semibold text-text-primary">Shipments</p>

          <div>
            <Button
              variant="quiet"
              aria-label="Add Shipment"
              className="rounded-full"
              onPress={() => {
                const shipmentId = id();
                db.transact(
                  db.tx.shipments[shipmentId].create({
                    title: DEFAULT_SHIPMENT_TITLE,
                  }),
                );
                navigate(`/dashboard/shipments/${shipmentId}`);
              }}
            >
              <IconPlus className="h-4 w-4 text-primary" />
            </Button>
            <Button
              variant="quiet"
              aria-label="Filter"
              className="rounded-full"
            >
              <IconFilter2 className="h-4 w-4" />
            </Button>
            <Button
              variant="quiet"
              aria-label="Settings"
              className="rounded-full"
            >
              <IconAdjustmentsHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <ListBox
          selectionMode="single"
          disallowEmptySelection
          items={shipments}
          selectedKeys={shipment ? [shipment.id] : []}
          onSelectionChange={(keys) => {
            if (keys === "all") return;
            const key = [...keys][0];
            if (key != null) navigate(`/dashboard/shipments/${key}`);
          }}
          className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden p-1"
        >
          {(item) => (
            <ListBoxItem id={item.id} textValue={item.title} className="py-3">
              <div className="w-full min-w-0 px-6 flex flex-row items-center justify-start">
                <div className="flex flex-col items-start min-w-0 w-full">
                  <span className="w-full truncate font-semibold text-text-primary text-sm md:text-base">
                    {item.title}
                  </span>
                  <span className="text-text-muted text-sm md:text-md">
                    {item.id}
                  </span>
                </div>
              </div>
            </ListBoxItem>
          )}
        </ListBox>
      </div>
      <Outlet />
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

  const { isLoading, error, data } = db.useQuery({
    shipments: {
      $: {
        where: {
          id: shipmentId,
        },
      },
      orders: {
        packages: {},
        customers: {},
        orderFrom: {},
        orderTo: {},
      },
    },
  });

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

  const { shipments } = data;

  const shipment = shipments[0];
  if (!shipment) {
    return (
      <div className="flex w-full md:w-4/5 h-full px-3 pb-3 items-center justify-center">
        <p>Shipment not Found</p>
      </div>
    );
  }

  const orders = shipments[0].orders;

  return (
    <div className="flex flex-col w-full md:w-4/5 h-full min-h-0 px-3 pb-3">
      <div className="h-13 w-[calc(100%+1.5rem)] -mx-3 border-b-7 border-surface px-3 md:px-5 pt-3 pb-3 flex items-center gap-1">
        <Button
          variant="quiet"
          aria-label="Back to shipments"
          className="md:hidden rounded-full shrink-0"
          onPress={() => navigate("/dashboard/shipments")}
        >
          <IconChevronLeft className="h-4 w-4" />
        </Button>
        <p className="font-semibold text-text-primary truncate">
          {shipment.title ? shipment.title : "Shipment not found"}
        </p>
      </div>
      <Form
        UNSAFE_className="w-full pl-2 pt-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const value =
            new FormData(e.currentTarget).get("title")?.toString().trim() ?? "";
          if (value !== shipment.title) {
            db.transact(db.tx.shipments[shipment.id].update({ title: value }));
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
      <div className="w-full flex-1 min-h-0 flex flex-col bg-surface">
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
                    <p className="shrink-0">{order.createdAt}</p>
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
      </div>
    </div>
  );
};
