import { describe, expect, it } from "vitest";
import {
  addressJobRowDetail,
  addressJobToneClass,
  estimateRowDetail,
  invoiceRowDetail,
  jobQuickDescription,
  jobInvoiceDateDisplay,
  jobServiceDateDisplay,
} from "../src/lib/customerDocLists.js";

describe("customerDocLists — address job rows", () => {
  it("jobQuickDescription prefers short titles and falls back to invoice #", () => {
    expect(jobQuickDescription({ title: "Service call" })).toBe("Service call");
    expect(jobQuickDescription({ invoiceNo: "251900" })).toBe("Invoice #251900");
    const long = "A".repeat(80);
    expect(jobQuickDescription({ title: long }).length).toBeLessThanOrEqual(48);
  });

  it("addressJobRowDetail marks unpaid invoices as Pay", () => {
    const d = addressJobRowDetail({
      title: "Panel",
      invoiceNo: "100",
      amount: "$500",
      paid: false,
      status: { Invoiced: { s: "done", d: "2026-07-01" } },
    });
    expect(d.actionLabel).toBe("Pay");
    expect(d.tone).toBe("pay");
    expect(d.amountLine).toBe("$500");
    expect(addressJobToneClass(d.tone)).toContain("red");
  });

  it("addressJobRowDetail marks paid jobs with paperwork as Do", () => {
    const d = addressJobRowDetail({
      title: "Meter job",
      invoiceNo: "200",
      amount: "$800",
      paid: true,
      status: { Invoiced: { s: "done", d: "2026-07-01" } },
      paperwork: {
        coned: { enabled: true, steps: { "Application submitted": "done" }, stepSince: {} },
      },
    });
    expect(d.actionLabel).toBe("Do");
    expect(d.tone).toBe("task");
    expect(addressJobToneClass(d.tone)).toContain("amber");
  });

  it("job date helpers format service and invoice dates", () => {
    expect(
      jobInvoiceDateDisplay({ invoiceDate: "2026-06-15", status: {} })
    ).toBe("06/15/2026");
    expect(
      jobServiceDateDisplay({
        invoiceLines: [{ serviceDate: "2026-07-02", itemName: "Work", unitPrice: 100 }],
      })
    ).toBe("07/02/2026");
  });

  it("invoiceRowDetail returns a formatted date", () => {
    const d = invoiceRowDetail({
      invoiceNo: "251900",
      amount: "$500",
      paid: false,
      openBalance: 500,
      invoiceDate: "2026-06-15",
      serviceAddress: "10 Oak St",
    });
    expect(d.date).toBe("06/15/2026");
    expect(d.amountLine).toBe("$500");
  });

  it("estimateRowDetail shows number, amount, address, and date", () => {
    const d = estimateRowDetail({
      estimateNo: "E-55",
      amount: "$1,200",
      serviceAddress: "20 Pine Rd",
      estimateDate: "2026-05-01",
    });
    expect(d.no).toBe("E-55");
    expect(d.amountLine).toBe("$1,200");
    expect(d.address).toContain("20 Pine Rd");
    expect(d.date).toBe("05/01/2026");
    expect(d.linked).toBe("");
  });

  it("estimateRowDetail links converted estimates to their invoice", () => {
    const d = estimateRowDetail({
      estimateNo: "E-9",
      invoiceNo: "251841",
      amount: "$2,300",
    });
    expect(d.linked).toBe(" → Inv #251841");
    expect(d.amountLine).toBe("$2,300");
  });
});