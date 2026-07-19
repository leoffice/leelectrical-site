import { describe, expect, it, vi } from "vitest";
import {
  buildInvoicePdf,
  buildInvoicePdfFromJob,
  canGenerateLocalInvoice,
  company,
  fmtBalance,
  fmtInvoiceDate,
  fmtMoney,
  mapJobToInvoicePdfData,
} from "../src/lib/invoicePdf.js";

describe("invoicePdf field mapping", () => {
  const job = {
    id: "J-1",
    customer: "Peretz Chein",
    billingAddress: "1370 Carroll St, Brooklyn, NY 11213",
    serviceAddress: "1370 Carroll St, Brooklyn, NY 11213",
    invoiceNo: "251841",
    amount: "$2,300",
    invoiceLines: [
      {
        itemName: "Panel upgrade",
        description: "Main panel upgrade: remove existing panel, install new hardware",
        qty: 1,
        unitPrice: 2300,
        serviceDate: "2026-06-30",
      },
    ],
    paid: true,
    openBalance: 0,
  };

  it("mapJobToInvoicePdfData maps invoice header, lines, and totals", () => {
    const d = mapJobToInvoicePdfData({ ...job, invoiceDate: "2026-06-30" });
    expect(d.invoiceNo).toBe("251841");
    expect(d.invoiceDate).toBe("06/30/2026");
    expect(d.billTo.name).toBe("Peretz Chein");
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].amount).toBe(2300);
    expect(d.total).toBe(2300);
    expect(d.paid).toBe(2300);
    expect(d.balanceDue).toBe(0);
    expect(d.serviceAddress).toBe("");
  });

  it("shows service address when different from bill-to", () => {
    const d = mapJobToInvoicePdfData({
      ...job,
      billingAddress: "405 Lefferts Ave, Brooklyn, NY 11225",
      serviceAddress: "479A East New York Ave, Brooklyn, NY 11225",
    });
    expect(d.serviceAddress).toContain("479A East New York");
  });

  it("appends apartment to service address", () => {
    const d = mapJobToInvoicePdfData({
      ...job,
      billingAddress: "405 Lefferts Ave, Brooklyn, NY 11225",
      serviceAddress: "479A East New York Ave, Brooklyn, NY 11225",
      apartment: "2A",
    });
    expect(d.serviceAddress).toMatch(/Apt\s*2A/i);
  });

  it("labels change-order invoice numbers", () => {
    const d = mapJobToInvoicePdfData({ ...job, changeOrder: true, invoiceNo: "251100-CO-1" });
    expect(d.invoiceNo).toBe("251100-CO-1 - Change Order");
  });

  it("canGenerateLocalInvoice allows drafts without invoice number when lines exist", () => {
    expect(canGenerateLocalInvoice(job)).toBe(true);
    expect(canGenerateLocalInvoice({ ...job, invoiceNo: "" })).toBe(true);
    expect(canGenerateLocalInvoice({ ...job, amount: "", invoiceLines: [] })).toBe(false);
  });

  it("fmt helpers match QBO style", () => {
    expect(fmtInvoiceDate("2026-06-30")).toBe("06/30/2026");
    expect(fmtMoney(2300)).toBe("2,300.00");
    expect(fmtBalance(0)).toBe("$0.00");
  });
});

describe("invoicePdf generation", () => {
  it("buildInvoicePdf returns a valid PDF blob with company + invoice markers", async () => {
    const blob = buildInvoicePdf({
      invoiceNo: "251841",
      invoiceDate: "06/30/2026",
      dueDate: "07/01/2026",
      billTo: { name: "Peretz Chein", address: "1370 Carroll St" },
      serviceAddress: "",
      lines: [{ description: "Panel upgrade", rate: 2300, qty: 1, amount: 2300 }],
      subtotal: 2300,
      tax: 0,
      discount: 0,
      total: 2300,
      paid: 2300,
      balanceDue: 0,
    });
    expect(blob.type).toBe("application/pdf");
    const text = await blob.text();
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain(company().name);
    expect(text).toContain(company().license || "Lic #11212");
    expect(company().name).not.toMatch(/Lic/);
    expect(text).toContain("251841");
    expect(text).toContain("INVOICE");
    expect(text).toContain("BILL TO");
    expect(text).toContain("SUBTOTAL");
    expect(text).toContain("BALANCE DUE");
    expect(text).toContain("Online Payment");
    expect(text).toContain("Zelle");
  });

  it("buildInvoicePdfFromJob wraps job mapping", async () => {
    const blob = buildInvoicePdfFromJob({
      customer: "Test Customer",
      invoiceNo: "999",
      amount: "$500",
      invoiceLines: [{ description: "Service call", qty: 1, unitPrice: 500 }],
    });
    const text = await blob.text();
    expect(text).toContain("Test Customer");
    expect(text).toContain("999");
  });
});