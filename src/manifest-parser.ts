import mammoth from "mammoth";
import Papa from "papaparse";
import { unzipSync } from "fflate";
import * as XLSX from "xlsx";

export interface ParsedPackage {
  number: string | null;
  name: string | null;
  phone: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
}

type Field = keyof ParsedPackage;
type Rows = string[][];

const MAX_ARCHIVE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_SIZE = 100_000;
const MAX_ROWS = 10_000;

const fieldAliases: Record<Field, string[]> = {
  number: [
    "number",
    "package",
    "package number",
    "package no",
    "package id",
    "parcel",
    "parcel number",
    "parcel no",
    "parcel id",
    "tracking number",
    "tracking no",
    "waybill",
    "waybill number",
  ],
  name: [
    "name",
    "consignee",
    "consignee name",
    "recipient",
    "recipient name",
    "receiver",
    "receiver name",
    "customer",
    "customer name",
  ],
  phone: [
    "phone",
    "phone number",
    "mobile",
    "mobile number",
    "telephone",
    "contact number",
    "consignee phone",
    "recipient phone",
    "whatsapp",
  ],
  weight: ["weight", "weight kg", "weight lb", "mass"],
  length: ["length", "length cm", "length in"],
  width: ["width", "width cm", "width in"],
  height: ["height", "height cm", "height in"],
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const aliases = new Map(
  Object.entries(fieldAliases).flatMap(([field, names]) =>
    names.map((name) => [normalizeHeader(name), field as Field] as const)
  ),
);

function headerMapping(rows: Rows): { index: number; columns: Map<number, Field> } | null {
  for (let index = 0; index < Math.min(rows.length, 20); index++) {
    const columns = new Map<number, Field>();
    for (const [column, value] of rows[index].entries()) {
      const field = aliases.get(normalizeHeader(value));
      if (field && ![...columns.values()].includes(field)) {
        columns.set(column, field);
      }
    }
    const includesIdentity = [...columns.values()].some((field) =>
      field === "number" || field === "name" || field === "phone"
    );
    if (columns.size >= 2 && includesIdentity) return { index, columns };
  }
  return null;
}

function cleanCell(value: string | undefined): string {
  return (value ?? "").replace(/\[[^\]]*]/g, "").trim();
}

function parseNumber(value: string): number | null {
  const cleaned = cleanCell(value).replace(/[,\s]/g, "");
  const numeric = cleaned.match(/^-?\d+(?:\.\d+)?/);
  if (!numeric) return null;
  const parsed = Number(numeric[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRows(rows: Rows): ParsedPackage[] {
  const header = headerMapping(rows);
  if (!header) {
    throw new Error(
      "Could not find a header row. Add columns such as Consignee, Phone, Package number, Weight, Length, Width, or Height.",
    );
  }

  const packages: ParsedPackage[] = [];
  for (const row of rows.slice(header.index + 1)) {
    const values: Partial<ParsedPackage> = {};
    for (const [column, field] of header.columns) {
      const value = cleanCell(row[column]);
      if (field === "weight" || field === "length" || field === "width" ||
        field === "height") {
        values[field] = parseNumber(value);
      } else if (field === "phone") {
        values.phone = value ? value.replace(/[-\s]/g, "") : null;
      } else {
        values[field] = value || null;
      }
    }

    if (Object.values(values).some((value) => value !== null && value !== undefined)) {
      packages.push({
        number: values.number ?? null,
        name: values.name ?? null,
        phone: values.phone ?? null,
        weight: values.weight ?? null,
        length: values.length ?? null,
        width: values.width ?? null,
        height: values.height ?? null,
      });
    }
    if (packages.length > MAX_ROWS) {
      throw new Error("This manifest has too many rows to preview. Try a smaller file.");
    }
  }

  if (packages.length === 0) {
    throw new Error("No shipment rows were found below the header row.");
  }
  return packages;
}

function validateArchive(bytes: Uint8Array): void {
  let expandedSize = 0;
  let entryCount = 0;
  unzipSync(bytes, {
    filter: ({ originalSize }) => {
      expandedSize += originalSize;
      entryCount++;
      if (expandedSize > MAX_ARCHIVE_SIZE || entryCount > 2048) {
        throw new Error("This compressed file expands beyond the allowed limit.");
      }
      return true;
    },
  });
}

function parseCsv(bytes: Uint8Array): Rows {
  const text = new TextDecoder("utf-8").decode(bytes);
  if (text.length > MAX_TEXT_SIZE) {
    throw new Error("This manifest has too much text to preview. Try a smaller file.");
  }
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
  });
  if (result.errors.length > 0) {
    throw new Error(`Could not parse CSV: ${result.errors[0].message}`);
  }
  return result.data;
}

function parseXlsx(bytes: Uint8Array): Rows {
  validateArchive(bytes);
  const workbook = XLSX.read(bytes, { type: "array" });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    if (headerMapping(rows)) return rows;
  }
  return [];
}

function decodeHtml(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16))
    );
}

async function parseDocx(bytes: Uint8Array): Promise<Rows> {
  validateArchive(bytes);
  const arrayBuffer = Uint8Array.from(bytes).buffer;
  const { value: html } = await mammoth.convertToHtml({ buffer: arrayBuffer });
  if (html.length > MAX_TEXT_SIZE) {
    throw new Error("This manifest has too much text to preview. Try a smaller file.");
  }

  const rows: Rows = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
      .map((cell) =>
        decodeHtml(
          cell[1]
            .replace(/<br\b[^>]*>/gi, " ")
            .replace(/<\/(?:p|div)>/gi, " ")
            .replace(/<[^>]*>/g, " "),
        ).trim()
      );
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

export async function parseManifest(
  fileName: string,
  bytes: Uint8Array,
): Promise<ParsedPackage[]> {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "csv") return parseRows(parseCsv(bytes));
  if (extension === "xlsx") return parseRows(parseXlsx(bytes));
  if (extension === "docx") {
    const rows = await parseDocx(bytes);
    if (rows.length === 0) {
      throw new Error("DOCX manifests must contain a table with a header row.");
    }
    return parseRows(rows);
  }
  throw new Error("Choose a CSV, Excel (.xlsx), or DOCX file.");
}
