import { describe, expect, it } from "vitest";
import {
  addressSimilarity,
  findJobByInvoice,
  findJobByServiceAddress,
  normalizeAddress,
  parseAddressFromMemo,
  parseInvoiceFromMemo,
  reconcileZellePayment,
} from "../src/lib/zelleReconcile.js";

const J1 = {
  id: "J-1",
  customer: "Peretz Chein",
  invoiceNo: "251841",
  serviceAddress: "123 Main St, Brooklyn",
  amount: "$2,300",
};
const J2 = {
  id: "J-2",
  customer: "Golan Chakov",
  invoiceNo: "231315",
  serviceAddress: "55 Elm St, Brooklyn",
  amount: "$11,000",
};

describe("parseInvoiceFromMemo", () => {
  it("extracts #251841 from memo", () => {
    expect(parseInvoiceFromMemo("Payment for #251841 panel")).toBe("251841");
  });
  it("extracts invoice word form", () => {
    expect(parseInvoiceFromMemo("invoice 231315")).toBe("231315");
  });
});

describe("parseAddressFromMemo", () => {
  it("extracts street from memo", () => {
    expect(parseAddressFromMemo("55 Elm St repair")).toMatch(/55 Elm St/i);
  });
});

describe("addressSimilarity", () => {
  it("matches abbreviated streets", () => {
    expect(addressSimilarity("123 Main Street", "123 Main St")).toBeGreaterThan(0.8);
  });
});

describe("findJobByInvoice", () => {
  it("finds job by invoice number", () => {
    expect(findJobByInvoice([J1, J2], "231315")?.id).toBe("J-2");
  });
});

describe("findJobByServiceAddress", () => {
  it("finds job by memo address", () => {
    expect(findJobByServiceAddress([J1, J2], "55 Elm Street Brooklyn")?.id).toBe("J-2");
  });
});

describe("reconcileZellePayment", () => {
  const extracted = {
    amount: 2300,
    confirmationNumber: "JPM99cnf72cg",
    date: "2026-07-09",
    memo: "#251841 123 Main St",
    confidence: "high",
  };

  it("full match when amount + invoice align", () => {
    const r = reconcileZellePayment({
      extracted,
      entered: { amount: 2300, ref: "", invoiceNo: "251841" },
      job: J1,
      jobs: [J1, J2],
    });
    expect(r.status).toBe("full_match");
    expect(r.confirmationRef).toBe("JPM99cnf72cg");
  });

  it("amount mismatch", () => {
    const r = reconcileZellePayment({
      extracted,
      entered: { amount: 2000, ref: "", invoiceNo: "251841" },
      job: J1,
      jobs: [J1, J2],
    });
    expect(r.status).toBe("discrepancy");
    expect(r.kind).toBe("amount_mismatch");
  });

  it("invoice mismatch with target job", () => {
    const r = reconcileZellePayment({
      extracted: { ...extracted, memo: "#231315 55 Elm St" },
      entered: { amount: 2300, ref: "", invoiceNo: "251841" },
      job: J1,
      jobs: [J1, J2],
    });
    expect(r.status).toBe("discrepancy");
    expect(r.kind).toBe("invoice_mismatch");
    expect(r.targetJob?.id).toBe("J-2");
  });

  it("address mismatch to different customer", () => {
    const r = reconcileZellePayment({
      extracted: {
        amount: 2300,
        confirmationNumber: "JPMabc",
        memo: "55 Elm St",
        confidence: "high",
      },
      entered: { amount: 2300, ref: "", invoiceNo: "251841" },
      job: J1,
      jobs: [J1, J2],
    });
    expect(r.status).toBe("discrepancy");
    expect(r.kind).toBe("address_mismatch");
    expect(r.targetJob?.id).toBe("J-2");
  });

  it("unreadable without confirmation", () => {
    const r = reconcileZellePayment({
      extracted: { amount: null, memo: "", confidence: "low" },
      entered: { amount: 2300, invoiceNo: "251841" },
      job: J1,
      jobs: [J1],
    });
    expect(r.status).toBe("unreadable");
  });
});

describe("normalizeAddress", () => {
  it("lowercases and abbreviates", () => {
    expect(normalizeAddress("123 Main Street.")).toBe("123 main st");
  });
});