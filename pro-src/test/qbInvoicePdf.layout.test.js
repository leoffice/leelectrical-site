import { describe, expect, it } from "vitest";
import { buildQbDocPdf } from "../src/lib/qbInvoicePdf.js";
import { mapJobToQbDocData } from "../src/lib/jobToQbDoc.js";

const baseJob = {
  id: "J-layout",
  customer: "Mendy Lein",
  billingAddress: "10 Billing St, Brooklyn, NY 11213",
  serviceAddress: "157 Remsen Ave, Brooklyn, NY 11212",
  invoiceNo: "251900",
  estimateNo: "25484",
  amount: "$5500",
  invoiceDate: "2026-07-22",
  dueDate: "2026-07-23",
  invoiceLines: [
    {
      itemName: "Panel",
      description: "100A service upgrade at 157 Remsen",
      qty: 1,
      unitPrice: 2200,
    },
  ],
  estimateLines: [
    {
      itemName: "Panel",
      description: "100A service upgrade at 157 Remsen",
      qty: 1,
      unitPrice: 2200,
    },
  ],
};

/** Pull printable text streams out of a client-built PDF blob. */
async function pdfText(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return s;
}

describe("qbInvoicePdf layout (Levi 2026-07-22)", () => {
  it("puts ESTIMATE title and BILLING/SERVICE ADDRESS labels on the PDF", async () => {
    const data = mapJobToQbDocData(baseJob, "estimate");
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("ESTIMATE");
    expect(text).toContain("BILLING ADDRESS");
    expect(text).toContain("SERVICE ADDRESS");
    expect(text).toContain("25484");
    expect(text).toContain("Mendy Lein");
    expect(text).toContain("SUBTOTAL");
    // Old single-column label should be gone
    expect(text).not.toMatch(/\(ADDRESS\)/);
  });

  it("puts INVOICE title, number, and due date on the PDF", async () => {
    const data = mapJobToQbDocData(baseJob, "invoice");
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    expect(text).toContain("INVOICE");
    expect(text).toContain("251900");
    expect(text).toContain("DUE DATE");
    expect(text).toContain("BILLING ADDRESS");
    expect(text).toContain("BALANCE DUE");
  });

  it("paginates a long description so SUBTOTAL still appears", async () => {
    const longDesc = Array.from({ length: 80 }, (_, i) => `- Scope line ${i + 1}: install conduit and feeders as needed`).join("\n");
    const data = mapJobToQbDocData(
      {
        ...baseJob,
        invoiceLines: [
          {
            itemName: "Long",
            description: longDesc,
            qty: 1,
            unitPrice: 5500,
          },
        ],
      },
      "invoice"
    );
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    expect(text).toContain("SUBTOTAL");
    expect(text).toContain("BALANCE DUE");
    // Multi-page marker
    expect(text).toMatch(/Page 1 of [2-9]/);
    expect(text).toMatch(/Page 2 of [2-9]/);
  });

  it("omits SERVICE ADDRESS when same as billing", async () => {
    const data = mapJobToQbDocData(
      {
        ...baseJob,
        billingAddress: "10 Same St, Brooklyn, NY",
        serviceAddress: "10 Same St, Brooklyn, NY",
      },
      "invoice"
    );
    expect(data.customFields || []).toHaveLength(0);
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    expect(text).toContain("BILLING ADDRESS");
    expect(text).not.toContain("SERVICE ADDRESS");
  });
});
