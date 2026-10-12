import { publicApi } from "./data";

export type ImportPackage = {
  id: string;
  number?: string | number | null;
  name?: string | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  weight?: number | null;
  phone?: string | null;
};

export type ShipmentImportDraft = {
  fileName: string;
  fileSize: number;
  packages: Omit<ImportPackage, "id">[];
};

export const PENDING_IMPORT_DRAFT_KEY = "smtn:pending-shipment-import";
export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;

export function readPendingImportDraft(): ShipmentImportDraft | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(PENDING_IMPORT_DRAFT_KEY);
  } catch (error) {
    console.error("Could not read the pending shipment import draft:", error);
    return null;
  }
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== "object" ||
      value === null ||
      !("fileName" in value) ||
      typeof value.fileName !== "string" ||
      !("fileSize" in value) ||
      typeof value.fileSize !== "number" ||
      !("packages" in value) ||
      !Array.isArray(value.packages)
    ) {
      console.error("Discarded an invalid pending shipment import draft.");
      return null;
    }
    return value as ShipmentImportDraft;
  } catch (error) {
    console.error("Could not restore the pending shipment import draft:", error);
    return null;
  }
}

export async function fileToPayload(file: File) {
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

export async function createShipmentImportDraft(
  file: File,
): Promise<ShipmentImportDraft> {
  if (
    !/\.(csv|xlsx|docx)$/i.test(file.name) ||
    file.size < 1 ||
    file.size > MAX_IMPORT_FILE_SIZE
  ) {
    throw new Error(
      "Choose a CSV, Excel (.xlsx), or DOCX file no larger than 10 MB.",
    );
  }
  const payload = await fileToPayload(file);
  const packages = await publicApi().parseFile(payload);
  return { fileName: file.name, fileSize: file.size, packages };
}

export function savePendingImportDraft(draft: ShipmentImportDraft): void {
  sessionStorage.setItem(PENDING_IMPORT_DRAFT_KEY, JSON.stringify(draft));
}
