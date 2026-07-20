import { describe, expect, it } from "vitest";
import {
  auditJobs,
  checkAutogenTripwire,
  checkDocUniqueness,
  checkIdNamespaces,
  checkPaymentLinkage,
} from "../src/lib/dataIntegrity.js";

describe("dataIntegrity", () => {
  it("flags a payment sitting in the job id namespace (the 2026-07-20 regression)", () => {
    const jobs = [
      { id: "qbo-16664", invoiceNo: "16664", payments: [{ id: "qbo-14811", jobId: "qbo-16664", invoiceNo: "16664" }] },
      { id: "qbo-14811", invoiceNo: "14811", payments: [] },
    ];
    const problems = checkIdNamespaces(jobs);
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe("payment_in_job_namespace");
    expect(problems[0].collidesWith).toBe("qbo-14811");
  });

  it("passes once payments are namespaced qbopay-", () => {
    const jobs = [
      { id: "qbo-16664", invoiceNo: "16664", payments: [{ id: "qbopay-14811", jobId: "qbo-16664", invoiceNo: "16664" }] },
      { id: "qbo-14811", invoiceNo: "14811", payments: [] },
    ];
    expect(checkIdNamespaces(jobs)).toHaveLength(0);
    expect(auditJobs(jobs)).toHaveLength(0);
  });

  it("flags a payment with no invoice back-reference", () => {
    const jobs = [{ id: "qbo-1", invoiceNo: "1", payments: [{ id: "qbopay-9" }] }];
    expect(checkPaymentLinkage(jobs)[0].kind).toBe("payment_unlinked");
  });

  it("flags a payment pointing at a different invoice than its host", () => {
    const jobs = [
      { id: "qbo-1", invoiceNo: "1", payments: [{ id: "qbopay-9", jobId: "qbo-2", invoiceNo: "2" }] },
      { id: "qbo-2", invoiceNo: "2", payments: [] },
    ];
    const kinds = checkPaymentLinkage(jobs).map((p) => p.kind);
    expect(kinds).toContain("payment_points_elsewhere");
    expect(kinds).toContain("payment_invoice_mismatch");
  });

  it("flags one invoice number spread across multiple jobs", () => {
    const jobs = [
      { id: "a", invoiceNo: "500" },
      { id: "b", invoiceNo: "500" },
    ];
    const problems = checkDocUniqueness(jobs);
    expect(problems[0].kind).toBe("duplicate_invoiceNo");
    expect(problems[0].jobIds).toEqual(["a", "b"]);
  });

  it("trips when one action auto-creates more than 3 invoices", () => {
    const prev = [{ id: "a", invoiceNo: "1" }];
    const next = [
      { id: "a", invoiceNo: "1" },
      { id: "b", invoiceNo: "2" },
      { id: "c", invoiceNo: "3" },
      { id: "d", invoiceNo: "4" },
      { id: "e", invoiceNo: "5" },
    ];
    const problems = checkAutogenTripwire(prev, next);
    expect(problems).toHaveLength(1);
    expect(problems[0].created).toBe(4);
  });

  it("allows a normal one-transaction-one-estimate write", () => {
    const prev = [{ id: "a", invoiceNo: "1" }];
    const next = [...prev, { id: "b", estimateNo: "2" }];
    expect(checkAutogenTripwire(prev, next)).toHaveLength(0);
  });
});
