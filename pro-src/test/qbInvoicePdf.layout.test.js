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

/** Parse text draws: { x, y, size, font, str } from client PDF stream. */
function parseTextOps(pdfStr) {
  const ops = [];
  const re =
    /BT \/(F[12]) ([\d.]+) Tf 1 0 0 1 ([\d.]+) ([\d.]+) Tm \((?:\\.|[^\\)])*\) Tj ET/g;
  let m;
  while ((m = re.exec(pdfStr))) {
    const full = m[0];
    const strM = full.match(/Tm \((.*)\) Tj ET$/);
    const raw = strM ? strM[1] : "";
    const str = raw.replace(/\\([()\\])/g, "$1");
    ops.push({
      font: m[1],
      size: Number(m[2]),
      x: Number(m[3]),
      y: Number(m[4]),
      str,
    });
  }
  return ops;
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

  it("aligns meta labels under the green title (not far left at 396)", async () => {
    const data = mapJobToQbDocData(baseJob, "invoice");
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    const ops = parseTextOps(text);
    // Bold green title (F2, size 16) right-side
    const title = ops.find((o) => o.str === "INVOICE" && o.font === "F2" && o.size === 16);
    expect(title).toBeTruthy();
    // Gray meta label "DATE" should start at same x as title left edge
    const dateLabel = ops.find((o) => o.str === "DATE" && o.font === "F1" && o.size === 8.5);
    expect(dateLabel).toBeTruthy();
    // Title is right-aligned; its left edge ≈ title.x; meta labels share that x
    expect(Math.abs(dateLabel.x - title.x)).toBeLessThan(1);
    // Not the old far-left meta column
    expect(dateLabel.x).toBeGreaterThan(450);
    // Value sits close to the right of the label (not the old 477 fixed column alone)
    const invNo = ops.find((o) => o.str === "251900");
    expect(invNo).toBeTruthy();
    expect(invNo.x).toBeGreaterThan(dateLabel.x);
    expect(invNo.x - dateLabel.x).toBeLessThan(80);
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
