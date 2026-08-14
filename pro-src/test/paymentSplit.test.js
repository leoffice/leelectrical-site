import { describe, expect, it } from "vitest";
import {
  autoAllocatePayment,
  sumAllocations,
  validatePaymentAllocations,
  allocationLines,
  money2,
} from "../src/lib/paymentSplit.js";

const inv = (id, invoiceNo, open, amount) => ({
  id,
  invoiceNo,
  amount: amount != null ? amount : open,
  openBalance: open,
  paid: open <= 0.01,
  payments: [],
});

describe("paymentSplit — multi-invoice allocate", () => {
  it("auto-splits exact match like Amos Cohen $9600 across $5k + $4.6k", () => {
    const invoices = [
      inv("a", "231504", 5000, 30000),
      inv("b", "251757", 4600, 4600),
    ];
    const allocs = autoAllocatePayment(invoices, 9600);
    expect(money2(allocs.a)).toBe(5000);
    expect(money2(allocs.b)).toBe(4600);
    expect(sumAllocations(allocs)).toBe(9600);
    const v = validatePaymentAllocations(invoices, allocs, 9600);
    expect(v.ok).toBe(true);
    expect(v.lines).toHaveLength(2);
  });

  it("prefers the opened job first when auto-allocating", () => {
    const invoices = [
      inv("big", "100", 8000, 8000),
      inv("small", "200", 2000, 2000),
    ];
    const allocs = autoAllocatePayment(invoices, 3000, { preferJobId: "small" });
    expect(money2(allocs.small)).toBe(2000);
    expect(money2(allocs.big)).toBe(1000);
  });

  it("rejects when applied sum does not equal payment total", () => {
    const invoices = [inv("a", "1", 5000), inv("b", "2", 4600)];
    const v = validatePaymentAllocations(invoices, { a: 5000, b: 0 }, 9600);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/must equal payment/i);
    expect(v.unallocated).toBe(4600);
  });

  it("rejects over-allocate on one invoice open balance", () => {
    const invoices = [inv("a", "1", 1000)];
    const v = validatePaymentAllocations(invoices, { a: 1500 }, 1500);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/exceeds open balance/i);
  });

  it("allocationLines drops zero rows", () => {
    const invoices = [inv("a", "1", 5000), inv("b", "2", 4600)];
    const lines = allocationLines(invoices, { a: 5000, b: 0 });
    expect(lines).toHaveLength(1);
    expect(lines[0].job.id).toBe("a");
  });
});
