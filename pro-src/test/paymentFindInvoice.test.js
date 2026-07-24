// Payment "Find invoice" targets — invoices + open estimates for convert flow.
import { describe, expect, it } from "vitest";
import {
  formatPayTargetOption,
  isOpenEstimateJob,
  payTargetsForCustomerPick,
} from "../src/lib/customerDocLists.js";

describe("payTargetsForCustomerPick", () => {
  const jobs = [
    {
      id: "j-inv",
      customer: "Mendeley Lane",
      invoiceNo: "9001",
      serviceAddress: "157 Ramson Avenue",
      amount: "$5000",
      paid: false,
      openBalance: 5000,
    },
    {
      id: "j-est",
      customer: "Mendeley Lane",
      estimateNo: "E-12",
      serviceAddress: "157 Ramson Avenue",
      estimateLines: [{ itemName: "Panel", qty: 1, unitPrice: 2000 }],
      amount: "$2000",
    },
    {
      id: "j-est-other",
      customer: "Mendeley Lane",
      estimateNo: "E-99",
      serviceAddress: "10 Other St",
      estimateLines: [{ itemName: "Outlet", qty: 1, unitPrice: 100 }],
      amount: "$100",
    },
    {
      id: "j-orphan-pay",
      customer: "Mendeley Lane",
      serviceAddress: "157 Ramson Avenue",
      payments: [{ id: "p1", amount: 2000, method: "Zelle", date: "2026-07-01" }],
    },
  ];

  it("lists invoices when the customer has any", () => {
    const list = payTargetsForCustomerPick(jobs, "Mendeley Lane", {
      preferAddress: "157 Ramson Avenue",
      includeJobId: "j-orphan-pay",
    });
    const kinds = list.map((t) => t.kind);
    expect(kinds).toContain("invoice");
    expect(list.some((t) => t.job.invoiceNo === "9001")).toBe(true);
    // With invoices present, other open estimates are not mixed in
    expect(list.filter((t) => t.kind === "estimate").length).toBe(0);
  });

  it("lists open estimates at the service address when there is no invoice", () => {
    const noInv = jobs.filter((j) => j.id !== "j-inv");
    const list = payTargetsForCustomerPick(noInv, "Mendeley Lane", {
      preferAddress: "157 Ramson Avenue",
      includeJobId: "j-orphan-pay",
    });
    expect(list.some((t) => t.kind === "estimate" && t.job.estimateNo === "E-12")).toBe(true);
    // Prefer same address — E-12 at Ramson should appear
    const estNos = list.filter((t) => t.kind === "estimate").map((t) => t.job.estimateNo);
    expect(estNos).toContain("E-12");
  });

  it("keeps the orphan payment job pickable", () => {
    const list = payTargetsForCustomerPick(jobs, "Mendeley Lane", {
      includeJobId: "j-orphan-pay",
    });
    expect(list.some((t) => String(t.job.id) === "j-orphan-pay")).toBe(true);
  });

  it("formatPayTargetOption marks estimates for convert", () => {
    const label = formatPayTargetOption(jobs.find((j) => j.id === "j-est"));
    expect(label).toMatch(/Est #E-12/);
    expect(label).toMatch(/Convert to invoice/i);
  });

  it("isOpenEstimateJob rejects jobs that already have an invoice", () => {
    expect(isOpenEstimateJob(jobs.find((j) => j.id === "j-inv"))).toBe(false);
    expect(isOpenEstimateJob(jobs.find((j) => j.id === "j-est"))).toBe(true);
  });
});
