import { describe, expect, it } from "vitest";
import {
  canGenerateLocalDoc,
  docPdfFilename,
  mapJobToQbDocData,
  qbCompany,
} from "../src/lib/jobToQbDoc.js";

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
      description: "Main panel upgrade",
      qty: 1,
      unitPrice: 2300,
      serviceDate: "2026-06-30",
    },
  ],
  paid: true,
  openBalance: 0,
};

describe("jobToQbDoc", () => {
  it("canGenerateLocalDoc allows drafts without doc number when billable lines exist", () => {
    expect(canGenerateLocalDoc(job, "invoice")).toBe(true);
    expect(canGenerateLocalDoc({ ...job, invoiceNo: "" }, "invoice")).toBe(true);
    expect(canGenerateLocalDoc({ ...job, amount: "", invoiceLines: [] }, "invoice")).toBe(false);
    expect(canGenerateLocalDoc({ ...job, invoiceNo: "", estimateNo: "9001", estimateLines: job.invoiceLines }, "estimate")).toBe(true);
  });

  it("canGenerateLocalDoc falls back to job.amount when line prices are missing", () => {
    // QBO import shape: description + amount only, no unitPrice
    expect(
      canGenerateLocalDoc(
        {
          ...job,
          invoiceLines: [{ description: "Panel upgrade", amount: 2300, qty: 1 }],
        },
        "invoice"
      )
    ).toBe(true);
    // Zero-qty staging lines must not block amount fallback
    expect(
      canGenerateLocalDoc(
        {
          ...job,
          amount: "$1,500",
          invoiceLines: [{ description: "Not billed yet", qty: 0, unitPrice: 5000 }],
        },
        "invoice"
      )
    ).toBe(true);
    // Amount-only job with empty lines
    expect(
      canGenerateLocalDoc({ ...job, invoiceLines: [], amount: "$800" }, "invoice")
    ).toBe(true);
  });

  it("mapJobToQbDocData uses DRAFT when no invoice number", () => {
    const d = mapJobToQbDocData({ ...job, invoiceNo: "" }, "invoice");
    expect(d.docNumber).toBe("DRAFT");
  });

  it("mapJobToQbDocData maps invoice fields for le-invoice-suite", () => {
    const d = mapJobToQbDocData({ ...job, invoiceDate: "2026-06-30" }, "invoice");
    expect(d.docType).toBe("INVOICE");
    expect(d.docNumber).toBe("251841");
    expect(d.company).toEqual(qbCompany());
    expect(d.date).toBe("06/30/2026");
    expect(d.billTo.name).toBe("Peretz Chein");
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].amount).toBe(2300);
    expect(d.amountDue).toBe(0);
  });

  it("docPdfFilename uses invoice number and customer", () => {
    expect(docPdfFilename("invoice", job)).toBe("Invoice_251841_Peretz_Chein.pdf");
    expect(docPdfFilename("estimate", { ...job, estimateNo: "25484", invoiceNo: "" })).toBe(
      "Estimate_25484_Peretz_Chein.pdf"
    );
  });

  it("docPdfFilename adds service address slug when different from billing", () => {
    const j = {
      ...job,
      billingAddress: "1 Billing St, Brooklyn, NY",
      serviceAddress: "1150 Eastern Parkway, Brooklyn, NY",
    };
    expect(docPdfFilename("invoice", j)).toBe(
      "Invoice_251841_Peretz_Chein_1150_Eastern_Parkway.pdf"
    );
  });

  it("mapJobToQbDocData maps estimate variant", () => {
    const est = {
      ...job,
      invoiceNo: "",
      estimateNo: "25484",
      estimateLines: job.invoiceLines,
      estimateDate: "2026-07-01",
    };
    const d = mapJobToQbDocData(est, "estimate");
    expect(d.docType).toBe("ESTIMATE");
    expect(d.docNumber).toBe("25484");
    expect(d.showAcceptance).toBe(true);
    expect(d.dueDate).toBeUndefined();
  });

  it("puts license under company contact (not in company name)", () => {
    expect(qbCompany().name).toBe("BLZ Electric Inc.");
    expect(qbCompany().license).toBe("Lic #11212");
    expect(qbCompany().name).not.toMatch(/Lic/);
    // Locks the QBO header's historic double space before the ZIP.
    expect(qbCompany().addressLines).toEqual(["383 Kingston Ave", "Brooklyn, NY  11213"]);
  });

  it("appends apartment to service address when set", () => {
    const d = mapJobToQbDocData(
      {
        ...job,
        billingAddress: "1 Billing St, Brooklyn, NY",
        serviceAddress: "479A East New York Ave, Brooklyn, NY 11225",
        apartment: "4B",
      },
      "invoice"
    );
    const svc = d.customFields.find((f) => /service address/i.test(f.label));
    expect(svc?.value).toContain("479A East New York");
    expect(svc?.value).toMatch(/Apt\s*4B/i);
  });

  it("labels change-order invoice numbers", () => {
    const d = mapJobToQbDocData({ ...job, changeOrder: true, invoiceNo: "251100-CO-1" }, "invoice");
    expect(d.docNumber).toBe("251100-CO-1 - Change Order");
  });

  it("includes payment options before thank-you on invoices", () => {
    const d = mapJobToQbDocData(job, "invoice");
    expect(d.messageLines.some((l) => /Online Payment/i.test(l))).toBe(true);
    expect(d.messageLines.some((l) => /Zelle/i.test(l))).toBe(true);
    expect(d.messageLines.some((l) => /Thank you for your business/i.test(l))).toBe(true);
    expect(d.messageLines.some((l) => /Sincerely/i.test(l))).toBe(true);
    const payIdx = d.messageLines.findIndex((l) => /Online Payment/i.test(l));
    const thanksIdx = d.messageLines.findIndex((l) => /Thank you for your business/i.test(l));
    expect(payIdx).toBeLessThan(thanksIdx);
  });

  it("prints description only — product/service name stays off the PDF", () => {
    const d = mapJobToQbDocData(
      {
        ...job,
        invoiceLines: [
          {
            itemName: "Service call",
            description: "Main panel upgrade",
            qty: 1,
            unitPrice: 2300,
          },
        ],
      },
      "invoice"
    );
    expect(d.lines[0].description).toBe("Main panel upgrade");
    expect(d.lines[0].description).not.toMatch(/Service call/);
  });

  it("preserves multi-line description newlines for print", () => {
    const d = mapJobToQbDocData(
      {
        ...job,
        invoiceLines: [
          {
            itemName: "Service call",
            description: "Diagnose breaker trip\nReplace faulty GFCI\nTest remaining outlets",
            qty: 1,
            unitPrice: 180,
          },
        ],
      },
      "invoice"
    );
    expect(d.lines[0].description).toBe(
      "Diagnose breaker trip\nReplace faulty GFCI\nTest remaining outlets"
    );
    expect(d.lines[0].description).not.toMatch(/Service call/);
  });

  it("never prints product/service name — even when description is empty", () => {
    const d = mapJobToQbDocData(
      {
        ...job,
        invoiceLines: [{ itemName: "Permit fee", description: "", qty: 1, unitPrice: 150 }],
      },
      "invoice"
    );
    expect(d.lines[0].description).toBe("");
    expect(d.lines[0].description).not.toMatch(/Permit fee/);
  });

  it("preserves blank lines and normalizes bullet dots for print", () => {
    const d = mapJobToQbDocData(
      {
        ...job,
        estimateLines: [
          {
            itemName: "Service Upgrade:2 Meters",
            description:
              "Installation at 157 Remsen Avenue as follows:\n\n• Removal of existing equipment\n• Installation of 100 A panel\n\nPrice does not include filing.",
            qty: 1,
            unitPrice: 2200,
          },
        ],
      },
      "estimate"
    );
    const desc = d.lines[0].description;
    expect(desc).toContain("\n\n");
    expect(desc).toContain("- Removal of existing equipment");
    expect(desc).toContain("- Installation of 100 A panel");
    expect(desc).not.toMatch(/Service Upgrade/);
    expect(desc).not.toMatch(/[•●]/);
  });
});