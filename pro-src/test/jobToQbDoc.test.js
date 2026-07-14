import { describe, expect, it } from "vitest";
import { canGenerateLocalDoc, mapJobToQbDocData, QB_COMPANY } from "../src/lib/jobToQbDoc.js";

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
  it("canGenerateLocalDoc requires doc number and billable lines", () => {
    expect(canGenerateLocalDoc(job, "invoice")).toBe(true);
    expect(canGenerateLocalDoc({ ...job, invoiceNo: "" }, "invoice")).toBe(false);
    expect(canGenerateLocalDoc({ ...job, amount: "", invoiceLines: [] }, "invoice")).toBe(false);
    expect(canGenerateLocalDoc({ ...job, invoiceNo: "", estimateNo: "9001", estimateLines: job.invoiceLines }, "estimate")).toBe(true);
  });

  it("mapJobToQbDocData maps invoice fields for le-invoice-suite", () => {
    const d = mapJobToQbDocData({ ...job, invoiceDate: "2026-06-30" }, "invoice");
    expect(d.docType).toBe("INVOICE");
    expect(d.docNumber).toBe("251841");
    expect(d.company).toEqual(QB_COMPANY);
    expect(d.date).toBe("06/30/2026");
    expect(d.billTo.name).toBe("Peretz Chein");
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].amount).toBe(2300);
    expect(d.amountDue).toBe(0);
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
});