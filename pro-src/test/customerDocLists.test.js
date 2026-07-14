import { describe, expect, it } from "vitest";
import {
  addressJobRowDetail,
  addressJobToneClass,
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
});