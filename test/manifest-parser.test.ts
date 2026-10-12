import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseManifest } from "../src/manifest-parser";

describe("parseManifest", () => {
  it("parses CSV headers and preserves phone and package-number text", async () => {
    const csv = [
      "Tracking Number,Consignee Name,Phone,Weight (kg),Length,Width,Height",
      '00123,Ada Okafor,"+1 (416) 555-0123",2.5,10,20,30',
    ].join("\n");

    await expect(
      parseManifest("manifest.csv", new TextEncoder().encode(csv)),
    ).resolves.toEqual([{
      number: "00123",
      name: "Ada Okafor",
      phone: "+1(416)5550123",
      weight: 2.5,
      length: 10,
      width: 20,
      height: 30,
    }]);
  });

  it("parses Excel workbooks and finds the header row in a later sheet", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Instructions"], ["Fill in the manifest"]]),
      "Instructions",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Package number", "Recipient", "Mobile number", "Weight"],
        ["P-7", "Bola Ade", "+234 801 234 5678", "4 kg"],
      ]),
      "Manifest",
    );
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    await expect(parseManifest("manifest.xlsx", new Uint8Array(bytes))).resolves
      .toEqual([{
        number: "P-7",
        name: "Bola Ade",
        phone: "+2348012345678",
        weight: 4,
        length: null,
        width: null,
        height: null,
      }]);
  });

  it("parses tabular DOCX manifests", async () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:tbl>
          <w:tr>
            <w:tc><w:p><w:r><w:t>Package number</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Consignee</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Phone</w:t></w:r></w:p></w:tc>
          </w:tr>
          <w:tr>
            <w:tc><w:p><w:r><w:t>P-8</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Ada &amp; Co</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>+14165550123</w:t></w:r></w:p></w:tc>
          </w:tr>
        </w:tbl><w:sectPr/></w:body>
      </w:document>`;
    const bytes = zipSync({
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        </Types>`,
      ),
      "_rels/.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
        </Relationships>`,
      ),
      "word/document.xml": strToU8(documentXml),
    });

    await expect(parseManifest("manifest.docx", bytes)).resolves.toEqual([{
      number: "P-8",
      name: "Ada & Co",
      phone: "+14165550123",
      weight: null,
      length: null,
      width: null,
      height: null,
    }]);
  });

  it("rejects files without recognized shipment headers", async () => {
    await expect(
      parseManifest("manifest.csv", new TextEncoder().encode("foo,bar\n1,2")),
    ).rejects.toThrow(/Could not find a header row/);
  });
});
