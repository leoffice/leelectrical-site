import { describe, expect, it } from "vitest";
import { buildQbDocPdf, pdfSafeAscii } from "../src/lib/qbInvoicePdf.js";
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
  it("pdfSafeAscii maps arrows/× so Helvetica never prints question marks", () => {
    expect(pdfSafeAscii("PLP meter → PLP equipment")).toMatch(/PLP meter to PLP equipment/);
    expect(pdfSafeAscii("4 ft × $200/ft")).toMatch(/4 ft x \$200\/ft/);
    expect(pdfSafeAscii("end-line box → metering — 4 ft")).toMatch(/end-line box to metering - 4 ft/);
    expect(pdfSafeAscii("a → b × c")).not.toMatch(/\?/);
  });

  it("estimate description with arrows renders without ? in PDF stream", async () => {
    const job = {
      ...baseJob,
      estimateLines: [
        {
          itemName: "Service Upgrade",
          description:
            "SCOPE:\n- PLP meter → PLP equipment: 1 ft (within included)\n- Main service line: 4 ft × $200/ft = $800\n- Service end-line box → metering equipment: 4 ft",
          qty: 1,
          unitPrice: 8160,
        },
      ],
    };
    const data = mapJobToQbDocData(job, "estimate");
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    expect(text).toContain("PLP meter to PLP equipment");
    expect(text).toMatch(/4 ft x \$200/);
    expect(text).toContain("end-line box to metering");
    // Old bug: Unicode became "?" in the PDF body
    expect(text).not.toMatch(/meter \? PLP/);
    expect(text).not.toMatch(/ft \? \$/);
    expect(text).not.toMatch(/box \? metering/);
  });

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

  it("puts colon between gray meta labels and values under first letter of title", async () => {
    const data = mapJobToQbDocData(baseJob, "invoice");
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    const ops = parseTextOps(text);
    // Bold green title (F2, size 16) right-side — title.x is left edge (E/I)
    const title = ops.find((o) => o.str === "INVOICE" && o.font === "F2" && o.size === 16);
    expect(title).toBeTruthy();
    // Colon between gray label and value
    const colon = ops.find((o) => o.str === ":" && o.font === "F1" && o.size === 8.5);
    expect(colon).toBeTruthy();
    // Colon roughly under the first letter (I) of INVOICE
    const titleLeft = title.x;
    expect(colon.x).toBeGreaterThan(titleLeft - 4);
    expect(colon.x).toBeLessThan(titleLeft + 20);
    // Gray label is right-aligned into the colon (label.x is its left edge after align:right)
    const dateLabel = ops.find((o) => o.str === "DATE" && o.font === "F1" && o.size === 8.5);
    expect(dateLabel).toBeTruthy();
    expect(dateLabel.x).toBeLessThan(colon.x);
    // Value sits just to the right of the colon
    const invNo = ops.find((o) => o.str === "251900");
    expect(invNo).toBeTruthy();
    expect(invNo.x).toBeGreaterThan(colon.x);
    expect(invNo.x - colon.x).toBeLessThan(20);
  });

  it("prints APT as a parallel field when apartment is set", async () => {
    const data = mapJobToQbDocData(
      {
        ...baseJob,
        apartment: "4B",
      },
      "invoice"
    );
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    expect(text).toContain("APT");
    expect(text).toContain("4B");
    expect(text).toContain("SERVICE ADDRESS");
    // Not baked into the street line as "Apt 4B"
    expect(text).not.toMatch(/Apt\s*4B/i);
  });

  it("puts estimate acceptance on its own page (not piled under totals)", async () => {
    const data = mapJobToQbDocData(baseJob, "estimate");
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    expect(text).toContain("Accepted By");
    expect(text).toContain("Accepted Date");
    // Acceptance forces a second page → page numbers appear
    expect(text).toMatch(/Page 1 of 2/);
    expect(text).toMatch(/Page 2 of 2/);
  });

  it("omits Page 1 of 1 on single-page invoices", async () => {
    const data = mapJobToQbDocData(baseJob, "invoice");
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    expect(text).toContain("BALANCE DUE");
    expect(text).not.toMatch(/Page 1 of 1/);
    expect(text).toContain("Powered by LE");
  });

  it("puts Powered by LE bottom-left (not centered)", async () => {
    const data = mapJobToQbDocData(baseJob, "invoice");
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    const ops = parseTextOps(text);
    const mark = ops.find((o) => o.str === "Powered by LE");
    expect(mark).toBeTruthy();
    // Left margin ≈ 36
    expect(mark.x).toBeLessThan(50);
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

  it("billing that mirrors the service address prints as contact + SERVICE ADDRESS (Levi 2026-08-11, LE-2700)", async () => {
    const data = mapJobToQbDocData(
      {
        ...baseJob,
        email: "cust@example.com",
        billingAddress: "10 Same St, Brooklyn, NY",
        serviceAddress: "10 Same St, Brooklyn, NY",
      },
      "invoice"
    );
    // The street belongs to SERVICE; Bill To carries the customer's contact.
    const svc = (data.customFields || []).find((f) => /service/i.test(f.label));
    expect(svc?.value).toMatch(/10 Same St/);
    expect(data.billTo.addressLines.join("\n")).not.toMatch(/10 Same St/);
    expect(data.billTo.addressLines.join("\n")).toMatch(/cust@example\.com/);
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    expect(text).toContain("BILLING ADDRESS");
    expect(text).toContain("SERVICE ADDRESS");
  });

  it("keeps Thank you / Sincerely below long payment methods (no signature scramble)", async () => {
    // White-label Card+ACH+Zelle+Check makes a tall left column; previously the
    // closing block was pinned to totals height and drew over Check/Zelle.
    const data = mapJobToQbDocData(baseJob, "invoice");
    expect(data.messageLines?.some((l) => /Thank you for your business/i.test(l))).toBe(true);
    const blob = buildQbDocPdf(data);
    const text = await pdfText(blob);
    const ops = parseTextOps(text);
    // Left gray body (~7.62) — payment + closing share margin x ≈ 36
    const left = ops.filter((o) => o.x < 50 && o.size > 7 && o.size < 9);
    const thanks = left.find((o) => /Thank you for your business/i.test(o.str));
    const sincerely = left.find((o) => /^Sincerely/i.test(o.str));
    expect(thanks).toBeTruthy();
    expect(sincerely).toBeTruthy();
    // Every payment-instruction draw must sit above the thank-you line.
    // (Do not match company name alone — Check lines also say "BLZ Electric Inc.")
    const payOps = left.filter(
      (o) =>
        /Online Payment|View\/Pay|Card:|ACH\s*\/|Zelle:|Check:|Make checks|secure link|process a check photo|card processing fee/i.test(
          o.str
        ) && !/Thank you for your business|Sincerely/i.test(o.str)
    );
    expect(payOps.length).toBeGreaterThan(3);
    // PDF y is from the bottom — lower y = further down the sheet.
    const payBottom = Math.min(...payOps.map((o) => o.y));
    expect(thanks.y).toBeLessThan(payBottom - 6);
    expect(sincerely.y).toBeLessThan(thanks.y);
  });
});
