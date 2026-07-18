import { useContext, useState } from "react";
import {
  DropZone,
  FileTrigger,
  GridList,
  GridListItem,
  OverlayTriggerStateContext,
  Selection,
} from "react-aria-components";
import { newHttpBatchRpcSession, RpcStub } from "capnweb";
import {
  IconCircleCheck,
  IconFileText,
  IconLoader2,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { Button } from "./Button";
import { Checkbox } from "@react-spectrum/s2";
import { db, id } from "../../instant";
import { useParams } from "react-router";
import { Lagos_Office, Toronto_Office } from "../../offices";
import { DEFAULT_SHIPMENT_TITLE } from "../routes/shipments";

type Package = {
  id: string;
  number: string | number;
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  phone: string;
};

interface API {
  parseFile(file: {
    name: string;
    type: string;
    size: number;
    data: string;
  }): Promise<Package[]>;
}

type Status = "idle" | "busy" | "done" | "error";

const api = () =>
  newHttpBatchRpcSession("https://api.smtncargo.com/rpc") as RpcStub<API>;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// capnweb sends JSON-serializable values, so read the file to base64 bytes.
async function fileToPayload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    data: btoa(binary),
  };
}

export const ImportShipment = ({ onDone }: { onDone?: () => void }) => {
  const overlay = useContext(OverlayTriggerStateContext);
  const close = () => {
    overlay?.close();
    onDone?.();
  };
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const { shipmentId } = useParams();

  const packageKeys = packages.map((pkg) => pkg.id);
  const isAllSelected =
    packageKeys.length > 0 &&
    (selectedKeys === "all" ||
      packageKeys.every((k) => (selectedKeys as Set<string>).has(k)));
  const hasAnySelected =
    selectedKeys === "all" || (selectedKeys as Set<string>).size > 0;
  const selectedCount =
    selectedKeys === "all"
      ? packageKeys.length
      : (selectedKeys as Set<string>).size;
  const importCount = packageKeys.length - selectedCount;

  const upload = async (next: File) => {
    setFile(next);
    setStatus("busy");
    setError(null);
    setPackages([]);
    setSelectedKeys(new Set());
    try {
      const payload = await fileToPayload(next);
      const parsed = await api().parseFile(payload);
      setPackages(parsed.map((pkg, i) => ({ ...pkg, id: String(i) })));
      setStatus("done");
    } catch (e) {
      console.error("uploadShipment failed:", e);
      setStatus("error");
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const handleSelect = (files: FileList | null) => {
    const next = files?.[0];
    if (next) upload(next);
  };

  const handleDrop = async (e: any) => {
    const item = e.items.find((i: { kind: string }) => i.kind === "file");
    if (item && item.kind === "file") upload(await item.getFile());
  };

  const reset = () => {
    setFile(null);
    setStatus("idle");
    setError(null);
  };

  if (file) {
    return (
      <div className="flex w-full h-full flex-col gap-3 rounded-xl bg-surface p-4">
        <div className="flex w-full items-center gap-3 shrink-0">
          <div className="flex items-center justify-center rounded-lg text-primary">
            {status === "busy" ? (
              <IconLoader2 size={20} className="animate-spin" />
            ) : status === "done" ? (
              <IconCircleCheck size={20} className="text-green-600" />
            ) : (
              <IconFileText size={20} />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold text-text-primary">
              {file.name}
            </span>
            <span
              className={`text-sm ${
                status === "error" ? "text-red-600" : "text-gray-500"
              }`}
            >
              {status === "busy"
                ? "Uploading…"
                : status === "done"
                  ? `${packages.length} package${packages.length === 1 ? "" : "s"} found`
                  : status === "error"
                    ? error
                    : formatSize(file.size)}
            </span>
          </div>
          <button
            type="button"
            onClick={reset}
            aria-label="Remove file"
            className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <IconX size={18} />
          </button>
        </div>

        {status === "done" && (
          <>
            {packages.length > 0 && (
              <div className="flex items-center gap-3 px-3 shrink-0">
                <Checkbox
                  aria-label="Select all"
                  size="XL"
                  isSelected={isAllSelected}
                  isIndeterminate={hasAnySelected && !isAllSelected}
                  onChange={(selected) =>
                    setSelectedKeys(selected ? new Set(packageKeys) : new Set())
                  }
                />
                <span className="text-sm font-semibold text-text-primary">
                  Import {importCount} package{importCount === 1 ? "" : "s"}
                </span>
              </div>
            )}
            <GridList
              aria-label="Parsed packages"
              selectionMode="multiple"
              items={packages}
              selectedKeys={selectedKeys}
              onSelectionChange={setSelectedKeys}
              className="flex-1 min-h-0 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden flex flex-col gap-1"
            >
              {(pkg: Package) => (
                <GridListItem
                  id={pkg.id}
                  textValue={`${pkg.number}`}
                  className="flex items-center gap-3 w-full rounded-lg border border-surface bg-surface px-3 py-2 cursor-pointer outline-none data-selected:border-primary data-selected:bg-primary/4"
                >
                  <Checkbox slot="selection" size="XL" />
                  <div className="w-full min-w-0 grid grid-cols-[5rem_minmax(0,1fr)_3.5rem] md:grid-cols-[7rem_16rem_1fr_4rem] items-center gap-2 md:gap-3">
                    <span className="font-semibold text-text-primary text-sm truncate">
                      {pkg.number}
                    </span>
                    <span className="font-semibold text-text-primary text-sm truncate">
                      {pkg.name}
                    </span>
                    <span className="hidden md:block font-semibold text-text-primary text-sm truncate">
                      {pkg.phone}
                    </span>
                    <span className="text-text-muted text-sm text-right whitespace-nowrap">
                      {pkg.weight} kg
                    </span>
                  </div>
                </GridListItem>
              )}
            </GridList>
            <div className="flex items-center justify-end gap-3 shrink-0">
              <Button variant="secondary" onPress={reset}>
                Cancel
              </Button>
              <Button
                variant="primary"
                isPending={isImporting}
                onPress={async () => {
                  if (isImporting) return;
                  setIsImporting(true);
                  try {
                    const toImport = packages.filter(
                      (pkg) =>
                        selectedKeys !== "all" &&
                        !(selectedKeys as Set<string>).has(pkg.id),
                    );

                    const { data } = await db.queryOnce({
                      shipments: {
                        $: { where: { id: shipmentId } },
                      },
                      customers: {
                        $: {
                          where: {
                            phone: {
                              $in: [
                                ...new Set(toImport.map((pkg) => pkg.phone)),
                              ],
                            },
                          },
                        },
                      },
                    });

                    const shipment = data.shipments[0];

                    const phoneToId: Record<string, string> = Object
                      .fromEntries(
                        data.customers
                          .filter((c): c is typeof c & { phone: string } =>
                            Boolean(c.phone)
                          )
                          .map((c) => [c.phone, c.id]),
                      );

                    const txs = toImport.flatMap((pkg) => {
                      const orderId = id();
                      const isNew = !(pkg.phone in phoneToId);
                      const customerId = (phoneToId[pkg.phone] ??= id());
                      return [
                        db.tx.orders[orderId]
                          .update({})
                          .link({ shipments: shipmentId }),
                        db.tx.orderFrom[id()]
                          .create({
                            description: Lagos_Office.description,
                            placeId: Lagos_Office.placeId,
                          })
                          .link({ orders: orderId }),
                        db.tx.orderTo[id()]
                          .create({
                            description: Toronto_Office.description,
                            placeId: Toronto_Office.placeId,
                          })
                          .link({ orders: orderId }),
                        db.tx.customers[customerId]
                          .update(
                            isNew ? { phone: pkg.phone, name: pkg.name } : {},
                          )
                          .link({ orders: orderId }),
                        db.tx.packages[id()]
                          .create({
                            number: pkg.number,
                            weight: pkg.weight,
                            length: pkg.length,
                            width: pkg.width,
                            height: pkg.height,
                          })
                          .link({ orders: orderId }),
                      ];
                    });

                    const renameTx =
                      shipmentId && shipment &&
                        shipment.title === DEFAULT_SHIPMENT_TITLE && file
                        ? [
                          db.tx.shipments[shipmentId].update({
                            title: file.name,
                          }),
                        ]
                        : [];

                    await db.transact([...txs, ...renameTx]);
                    close();
                  } finally {
                    setIsImporting(false);
                  }
                }}
              >
                Import
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <DropZone
      onDrop={handleDrop}
      className={({ isDropTarget }) =>
        `w-full h-full rounded-xl border-2 border-dashed p-8 transition-colors bg-surface`
      }
    >
      <div className="flex flex-col h-full bg-surface items-center justify-center gap-3 text-center text-text-primary">
        <div className="flex h-12 w-12 items-center justify-center rounded-full text-text-primary">
          <IconUpload size={24} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-text-muted">
            Drag &amp; drop your shipment file
          </span>
          <span className="text-sm text-text-secondary">
            CSV, PDF or XLSX up to 10&nbsp;MB
          </span>
        </div>
        <FileTrigger
          acceptedFileTypes={[".csv", ".pdf", ".xlsx", ".docx"]}
          onSelect={handleSelect}
        >
          <Button variant="secondary">Browse files</Button>
        </FileTrigger>
      </div>
    </DropZone>
  );
};

export default ImportShipment;
