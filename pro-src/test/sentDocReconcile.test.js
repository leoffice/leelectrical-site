// Self-heal for sent-but-unsaved invoices — Levi 2026-08-11.
// Fixtures use the REAL pay-link payload for LE-251859 (Mordechai Nemni), the
// invoice that reached the customer while the app showed them $0.
import { describe, expect, it } from "vitest";
import {
  buildRecoveredInvoicePatch,
  findUnsavedSentInvoices,
  invoiceNumbersInStore,
  planSentDocRecovery,
} from "../../netlify/functions/lib/sentDocReconcile.mjs";

const JOB_ID = "local-1785273815640";

/** Verbatim from KV paylinks/pl-251859-s5yr. */
const realRecord = {
  payload: {
    j: JOB_ID,
    i: "LE-251859",
    a: 500,
    fe: 1,
    c: "Mordechai Nemni",
    w: "Equipment safety inspection — 1254 Sterling Pl Brooklyn — main metering equipment",
    t: "$500.00",
    d: "$500.00",
    e: "nemnifam@gmail.com",
    ph: "718-809-0687",
    sa: "1254 sterling pl brooklyn",
    ba: "1254 sterling pl brooklyn",
    as: "2026-08-11",
    k: "i",
    lines: [
      {
        itemName: "7 Plans and Permits:Load Letter",
        itemId: "",
        description:
          "Equipment safety inspection — 1254 Sterling Pl Brooklyn — main metering equipment",
        qty: 1,
        unitPrice: 500,
      },
    ],
  },
  createdAt: 1786418736525,
  invoiceNo: "LE-251859",
};

const payLinks = [{ code: "251859-s5yr", record: realRecord }];

/** The job as it actually is in the overlay: customer linked, no invoice. */
const nemniJob = {
  id: JOB_ID,
  customer: "Mordechai Nemni",
  businessName: "Mordechai Nemni",
  personName: "Mordechai Nemni",
  email: "nemnifam@gmail.com",
  phone: "718-809-0687",
  address: "1254 sterling pl brooklyn",
  serviceAddress: "1254 sterling pl brooklyn",
  qboCustomerId: "1608",
};

describe("detecting sent-but-unsaved invoices", () => {
  it("finds LE-251859 missing from the store", () => {
    const { missing, skipped } = findUnsavedSentInvoices(payLinks, { [JOB_ID]: nemniJob });
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({
      invoiceNo: "LE-251859",
      jobId: JOB_ID,
      customer: "Mordechai Nemni",
      amount: 500,
      code: "251859-s5yr",
    });
    expect(skipped).toHaveLength(0);
  });

  it("is idempotent — skips an invoice already in the store", () => {
    const ov = { [JOB_ID]: { ...nemniJob, invoiceNo: "LE-251859" } };
    const { missing, skipped } = findUnsavedSentInvoices(payLinks, ov);
    expect(missing).toHaveLength(0);
    expect(skipped[0].reason).toBe("already_in_store");
  });

  it("never overwrites a job that carries a different invoice", () => {
    const ov = { [JOB_ID]: { ...nemniJob, invoiceNo: "LE-2712" } };
    const { missing, skipped } = findUnsavedSentInvoices(payLinks, ov);
    expect(missing).toHaveLength(0);
    expect(skipped[0]).toMatchObject({ reason: "job_has_other_invoice", existing: "LE-2712" });
  });

  it("does not invent a job that no longer exists", () => {
    const { missing, skipped } = findUnsavedSentInvoices(payLinks, {});
    expect(missing).toHaveLength(0);
    expect(skipped[0].reason).toBe("job_missing");
  });

  it("ignores estimates and malformed links", () => {
    const links = [
      { code: "a", record: { payload: { j: JOB_ID, i: "E-1", k: "e" } } },
      { code: "b", record: { payload: { i: "LE-9" } } }, // no job
      { code: "c", record: { payload: { j: JOB_ID } } }, // no number
    ];
    const { missing, skipped } = findUnsavedSentInvoices(links, { [JOB_ID]: nemniJob });
    expect(missing).toHaveLength(0);
    expect(skipped.map((s) => s.reason)).toEqual([
      "not_an_invoice",
      "incomplete_paylink",
      "incomplete_paylink",
    ]);
  });

  it("never touches a QBO-backed job — QuickBooks holds its invoice of record", () => {
    const links = [
      { code: "q1", record: { payload: { j: "qbo-14605", i: "14605", a: 1940, k: "i" } } },
      { code: "q2", record: { payload: { j: "qbo-est-25484", i: "251852", a: 1500, k: "i" } } },
    ];
    const ov = { "qbo-14605": { customer: "YHS" }, "qbo-est-25484": { customer: "Lein" } };
    const { missing, skipped } = findUnsavedSentInvoices(links, ov);
    expect(missing).toHaveLength(0);
    expect(skipped.map((s) => s.reason)).toEqual(["qbo_backed", "qbo_backed"]);
  });

  it("restores only the LAST send when several links witness the same job", () => {
    // The real collision: LE-251858 was an earlier send attempt on the same
    // Nemni job; LE-251859 (251859-s5yr) is the link the customer holds.
    const stale = {
      code: "251858-x1y2",
      record: {
        payload: { ...realRecord.payload, i: "LE-251858" },
        createdAt: realRecord.createdAt - 60_000,
      },
    };
    const { missing, skipped } = findUnsavedSentInvoices(
      [stale, ...payLinks],
      { [JOB_ID]: nemniJob }
    );
    expect(missing).toHaveLength(1);
    expect(missing[0].invoiceNo).toBe("LE-251859");
    expect(missing[0].code).toBe("251859-s5yr");
    expect(skipped).toEqual([
      expect.objectContaining({
        invoiceNo: "LE-251858",
        reason: "superseded_by_newer_send",
        winner: "LE-251859",
      }),
    ]);
    // Same outcome regardless of which link the store lists first.
    const reversed = findUnsavedSentInvoices([...payLinks, stale], { [JOB_ID]: nemniJob });
    expect(reversed.missing.map((m) => m.invoiceNo)).toEqual(["LE-251859"]);
  });

  it("reads every invoice number already in the overlay", () => {
    const set = invoiceNumbersInStore({
      a: { invoiceNo: "LE-2703" },
      b: { invoiceNo: "251841" },
      _auditLog: { byId: {} },
      c: {},
    });
    expect(set.has("LE-2703")).toBe(true);
    expect(set.has("251841")).toBe(true);
    expect(set.size).toBe(2);
  });
});

describe("re-materializing the invoice", () => {
  const found = findUnsavedSentInvoices(payLinks, { [JOB_ID]: nemniJob }).missing[0];
  const patch = buildRecoveredInvoicePatch(found, nemniJob, realRecord, 1786460000000);

  it("keeps the original number, amount and balance", () => {
    expect(patch.invoiceNo).toBe("LE-251859");
    expect(patch.amount).toBe(500);
    expect(patch.openBalance).toBe(500);
    expect(patch.paid).toBe(false);
  });

  it("reuses the SAME pay reference so the sent link still reconciles", () => {
    expect(patch.payCode).toBe("251859-s5yr");
    expect(patch.payUrl).toBe("https://leelectrical.us/pay/251859-s5yr");
  });

  it("carries the real line item, not a placeholder", () => {
    expect(patch.invoiceLines).toHaveLength(1);
    expect(patch.invoiceLines[0]).toMatchObject({
      itemName: "7 Plans and Permits:Load Letter",
      qty: 1,
      unitPrice: 500,
    });
    expect(patch.invoiceLines[0].description).toMatch(/Equipment safety inspection/);
  });

  it("dates it from the sent record and marks the job Invoiced", () => {
    expect(patch.invoiceDate).toBe("2026-08-11");
    expect(patch.dueDate).toBe("2026-08-12");
    expect(patch.status.Invoiced).toEqual({ s: "done", d: "2026-08-11" });
  });

  it("links the stored invoice PDF the customer received", () => {
    expect(patch.docKey).toBe("inv-LE-251859");
    expect(patch.attachments.some((a) => a.url.includes("inv-LE-251859"))).toBe(true);
  });

  it("marks the record as recovered for the audit trail", () => {
    expect(patch._recoveredFrom).toBe("paylink:251859-s5yr");
    expect(patch._recoveredNote).toMatch(/sent to the customer/);
  });
});

describe("the full plan", () => {
  it("produces one patch for LE-251859 and nothing else", () => {
    const { plan } = planSentDocRecovery(payLinks, { [JOB_ID]: nemniJob });
    expect(plan).toHaveLength(1);
    expect(plan[0].jobId).toBe(JOB_ID);
    expect(plan[0].patch.invoiceNo).toBe("LE-251859");
  });

  it("running it twice changes nothing the second time", () => {
    const ov = { [JOB_ID]: { ...nemniJob } };
    const first = planSentDocRecovery(payLinks, ov);
    expect(first.plan).toHaveLength(1);
    // apply
    ov[JOB_ID] = { ...ov[JOB_ID], ...first.plan[0].patch };
    const second = planSentDocRecovery(payLinks, ov);
    expect(second.plan).toHaveLength(0);
  });
});
