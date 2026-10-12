import { useCallback, useContext, useEffect, useState } from "react";
import {
  OverlayTriggerStateContext,
  type OverlayTriggerState,
  type Selection,
} from "react-aria-components";
import {
  IconAlertCircle,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconCircleCheck,
  IconFileText,
  IconLoader2,
  IconX,
} from "@tabler/icons-react";
import { Checkbox } from "@react-spectrum/s2";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "./Button";
import { refetchAll, useTenantApi } from "../data";
import { useNavigate, useParams } from "react-router";
import { Lagos_Office, Toronto_Office } from "../../offices";
import { DEFAULT_SHIPMENT_TITLE } from "../routes/shipments";
import {
  createShipmentImportDraft,
  type ImportPackage,
  type ShipmentImportDraft,
} from "../shipment-import";

export {
  PENDING_IMPORT_DRAFT_KEY,
  readPendingImportDraft,
  type ShipmentImportDraft,
} from "../shipment-import";
export type { ImportPackage } from "../shipment-import";

type Status = "idle" | "busy" | "done" | "error";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ImportShipment = ({
  onDone,
  initialDraft,
  fileToUpload,
  onFileHandled,
  onExpand,
  onClose,
  isExpanded = false,
}: {
  onDone?: () => void;
  initialDraft?: ShipmentImportDraft | null;
  fileToUpload?: File | null;
  onFileHandled?: () => void;
  onExpand?: () => void;
  onClose?: () => void;
  isExpanded?: boolean;
}) => {
  const overlay = useContext<OverlayTriggerState | null>(
    OverlayTriggerStateContext,
  );
  const close = () => {
    overlay?.close();
    onDone?.();
  };

  const [fileName, setFileName] = useState(initialDraft?.fileName ?? "");
  const [fileSize, setFileSize] = useState(initialDraft?.fileSize ?? 0);
  const [status, setStatus] = useState<Status>(initialDraft ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [packages, setPackages] = useState<ImportPackage[]>(() =>
    initialDraft?.packages.map((pkg, i) => ({ ...pkg, id: String(i) })) ?? [],
  );
  const [selectedKeys, setSelectedKeys] = useState<Selection>(
    () => new Set(initialDraft?.packages.map((_, i) => String(i)) ?? []),
  );
  const [isImporting, setIsImporting] = useState(false);
  const getApi = useTenantApi();
  const { isLoaded: authLoaded, isSignedIn, orgId } = useAuth();
  const navigate = useNavigate();
  const { shipmentId } = useParams();
  const packageKeys = packages.map((pkg) => pkg.id);
  const selectedCount =
    selectedKeys === "all"
      ? packageKeys.length
      : packageKeys.filter((key) => selectedKeys.has(key)).length;

  const upload = useCallback(async (next: File) => {
    setFileName(next.name);
    setFileSize(next.size);
    setStatus("busy");
    setError(null);
    setImportError(null);
    setPackages([]);
    setSelectedKeys(new Set());
    try {
      const draft = await createShipmentImportDraft(next);
      const nextPackages = draft.packages.map((pkg, i) => ({
        ...pkg,
        id: String(i),
      }));
      setPackages(nextPackages);
      setSelectedKeys(new Set(nextPackages.map((pkg) => pkg.id)));
      setStatus("done");
    } catch (e) {
      console.error("uploadShipment failed:", e);
      setStatus("error");
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }, []);

  useEffect(() => {
    if (!fileToUpload) return;
    void upload(fileToUpload);
    onFileHandled?.();
  }, [fileToUpload, onFileHandled, upload]);

  const reset = () => {
    setFileName("");
    setFileSize(0);
    setPackages([]);
    setSelectedKeys(new Set());
    setStatus("idle");
    setError(null);
    setImportError(null);
  };

  const togglePackage = (id: string, selected: boolean) => {
    const next = new Set(
      selectedKeys === "all" ? packageKeys : [...selectedKeys],
    );
    if (selected) next.add(id);
    else next.delete(id);
    setSelectedKeys(next);
  };

  return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-[#e3e1da] bg-white text-left shadow-[0_8px_32px_rgba(54,50,40,0.07)]">
        <header className="flex items-center justify-between gap-3 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f5f4f0] text-[#77756e]">
              {status === "busy" || isImporting ? (
                <IconLoader2 size={19} className="animate-spin" />
              ) : status === "done" ? (
                <IconCircleCheck size={19} className="text-[#188038]" />
              ) : (
                <IconFileText size={19} />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#282724]">
                {fileName || "Shipment table"}
              </p>
              <p className="mt-0.5 truncate text-xs text-[#929087]">
                {status === "busy"
                  ? "Reading your shipment details…"
                  : status === "error"
                    ? "We couldn’t read this file"
                    : status === "done"
                        ? `${packages.length} package${packages.length === 1 ? "" : "s"} found · ${formatSize(fileSize)}`
                        : "Upload a spreadsheet to preview customer shipments"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {fileName ? (
              <button
                type="button"
                onClick={reset}
                aria-label="Remove uploaded file"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#929087] transition hover:bg-[#f5f4f0] hover:text-[#282724]"
              >
                <IconX size={17} />
              </button>
            ) : null}
            {onExpand && (
              <button
                type="button"
                onClick={onExpand}
                aria-label={isExpanded ? "Restore shipment table" : "Expand shipment table"}
                title={isExpanded ? "Restore" : "Expand"}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#77756e] transition hover:bg-[#f5f4f0] hover:text-[#282724]"
              >
                {isExpanded
                  ? <IconArrowsMinimize size={17} />
                  : <IconArrowsMaximize size={17} />}
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close shipment table"
                title="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#77756e] transition hover:bg-[#f5f4f0] hover:text-[#282724]"
              >
                <IconX size={18} />
              </button>
            )}
          </div>
        </header>

        <div className="mx-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-[#eeece6] sm:mx-5">
          <div className="h-full overflow-auto">
            <table className="w-full min-w-2xl border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#faf9f6]">
                <tr className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#929087]">
                  <th className="sticky left-0 z-20 w-14 border-b border-[#eeece6] bg-[#faf9f6] px-3 py-3 sm:px-4">
                    <Checkbox
                      aria-label="Include all packages"
                      size="M"
                      isDisabled={packages.length === 0 || status !== "done"}
                      isSelected={
                        packages.length > 0 && selectedCount === packages.length
                      }
                      isIndeterminate={
                        selectedCount > 0 && selectedCount < packages.length
                      }
                      onChange={(selected: boolean) =>
                        setSelectedKeys(
                          selected ? new Set(packageKeys) : new Set(),
                        )
                      }
                    />
                  </th>
                  <th className="border-b border-[#eeece6] px-3 py-3 font-medium sm:px-4">
                    ID
                  </th>
                  <th className="border-b border-[#eeece6] px-3 py-3 font-medium sm:px-4">
                    Name
                  </th>
                  <th className="border-b border-[#eeece6] px-3 py-3 font-medium sm:px-4">
                    Phone
                  </th>
                  <th className="border-b border-[#eeece6] px-3 py-3 font-medium sm:px-4">
                    Length
                  </th>
                  <th className="border-b border-[#eeece6] px-3 py-3 font-medium sm:px-4">
                    Width
                  </th>
                  <th className="border-b border-[#eeece6] px-3 py-3 font-medium sm:px-4">
                    Height
                  </th>
                  <th className="border-b border-[#eeece6] px-3 py-3 font-medium sm:px-4">
                    Weight
                  </th>
                </tr>
              </thead>
              {packages.length > 0 && status === "done" ? (
                <tbody>
                  {packages.map((pkg) => {
                    const isIncluded =
                      selectedKeys === "all" || selectedKeys.has(pkg.id);
                    return (
                      <tr
                        key={pkg.id}
                        className={`group transition-colors hover:bg-[#fcfbf9] ${
                          isIncluded ? "" : "opacity-55"
                        }`}
                      >
                        <td className="sticky left-0 border-b border-[#f1f0ec] bg-white px-3 py-3 sm:px-4">
                          <Checkbox
                            aria-label={`Include ${pkg.name || pkg.number || "unnamed"} package`}
                            size="M"
                            isSelected={isIncluded}
                            onChange={(selected: boolean) =>
                              togglePackage(pkg.id, selected)
                            }
                          />
                        </td>
                        <td className="border-b border-[#f1f0ec] px-3 py-3 font-mono text-[11px] text-[#77756e] sm:px-4">
                          {pkg.number ?? (
                            <span className="font-sans text-[#a8a69e]">—</span>
                          )}
                        </td>
                        <td className="border-b border-[#f1f0ec] px-3 py-3 sm:px-4">
                          <span className="max-w-40 truncate font-medium text-[#34332f]">
                            {pkg.name || "Unnamed customer"}
                          </span>
                        </td>
                        <td className="border-b border-[#f1f0ec] px-3 py-3 text-[#77756e] sm:px-4">
                          {pkg.phone || (
                            <span className="text-[#a8a69e]">Not provided</span>
                          )}
                        </td>
                        {[pkg.length, pkg.width, pkg.height, pkg.weight].map(
                          (dimension, index) => (
                            <td
                              key={index}
                              className="border-b border-[#f1f0ec] px-3 py-3 text-[#77756e] sm:px-4"
                            >
                              {dimension ?? (
                                <span className="text-[#a8a69e]">—</span>
                              )}
                            </td>
                          ),
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              ) : (
                <tbody>
                  <tr>
                    <td colSpan={8} className="h-48 px-6 text-center">
                      {status === "busy" ? (
                        <div className="inline-flex items-center gap-2 text-sm text-[#77756e]">
                          <IconLoader2 size={16} className="animate-spin" />
                          Reading the table…
                        </div>
                      ) : status === "error" ? (
                        <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                          <IconAlertCircle size={20} className="text-red-600" />
                          <p className="text-sm font-medium text-[#34332f]">
                            Couldn’t read this file
                          </p>
                          <p className="text-xs leading-5 text-[#77756e]">{error}</p>
                        </div>
                      ) : status === "done" ? (
                        <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                          <IconAlertCircle size={20} className="text-[#9a6700]" />
                          <p className="text-sm font-medium text-[#34332f]">
                            No packages found
                          </p>
                          <p className="text-xs leading-5 text-[#77756e]">
                            Try a shipment manifest with customer names, package
                            numbers, or phone numbers.
                          </p>
                        </div>
                      ) : (
                        <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f5f4f0] text-[#77756e]">
                            <IconFileText size={18} />
                          </span>
                          <p className="text-sm font-medium text-[#34332f]">
                            Your shipment rows will appear here
                          </p>
                          <p className="text-xs text-[#929087]">
                            Customer, package, phone, and shipment details
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>
        </div>

        <footer className="px-3 pb-3 pt-4 sm:px-5 sm:pb-5">
          {importError && (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700"
            >
              <IconAlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{importError}</span>
            </div>
          )}
          <div className="flex justify-end">
            {fileName && status === "done" && packages.length > 0 && (
              <Button
                  variant="primary"
                  isPending={isImporting}
                  isDisabled={
                    selectedCount === 0 ||
                    !authLoaded ||
                    !isSignedIn ||
                    !orgId
                  }
                  onPress={async () => {
                    if (isImporting || selectedCount === 0) return;
                    if (!isSignedIn || !orgId) {
                      setImportError("Sign in to import this shipment.");
                      return;
                    }
                    const toImport = packages.filter(
                      (pkg) =>
                        selectedKeys === "all" || selectedKeys.has(pkg.id),
                    );
                    setIsImporting(true);
                    setImportError(null);
                    try {
                      const result = await (await getApi()).importPackages({
                        ...(shipmentId ? { shipmentId } : {}),
                        fileName,
                        defaultTitle: DEFAULT_SHIPMENT_TITLE,
                        from: {
                          description: Lagos_Office.description,
                          placeId: Lagos_Office.placeId,
                        },
                        to: {
                          description: Toronto_Office.description,
                          placeId: Toronto_Office.placeId,
                        },
                        packages: toImport.map((pkg) => ({
                          number: pkg.number == null ? null : String(pkg.number),
                          name: pkg.name ?? null,
                          phone: pkg.phone ?? null,
                          weight: pkg.weight ?? null,
                          length: pkg.length ?? null,
                          width: pkg.width ?? null,
                          height: pkg.height ?? null,
                        })),
                      });
                      refetchAll();
                      close();
                      if (!shipmentId) {
                        navigate(`/shipments/${result.shipmentId}`);
                      }
                    } catch (e) {
                      console.error("importPackages failed:", e);
                      setImportError(
                        e instanceof Error
                          ? e.message
                          : "Could not import this shipment.",
                      );
                    } finally {
                      setIsImporting(false);
                    }
                  }}
              >
                {`Import ${selectedCount}`}
              </Button>
            )}
          </div>
        </footer>
      </section>
  );
};

export default ImportShipment;
