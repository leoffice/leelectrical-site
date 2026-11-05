import { describe, expect, it } from "vitest";
import { applyPaymentLedger, ledgerPaid, paymentsForTransfer } from "../src/lib/paymentTransfer.js";
import { paymentRows } from "../src/lib/customerDocLists.js";

const invoice = {
  id: "local-260728",
  invoiceNo: "260728",
  amount: "$13,300",
  discount: 450,
  openBalance: "6900",
  paid: false,
};

describe("payment ledger attach", () => {
  it("fills a list job from the ledger and leaves an existing ledger in place", () => {
    const ledger = {
      view: "ledger",
      jobs: [
        {
          id: "local-260728",
          invoiceNo: "260728",
          payments: [{ id: "pay-1", amount: 5950, date: "2026-11-05", method: "Zelle" }],
        },
      ],
    };
    const filled = applyPaymentLedger([{ ...invoice }], ledger);
    expect(filled[0].payments).toHaveLength(1);
    expect(filled[0].payments[0].id).toBe("pay-1");
    expect(paymentRows(filled)).toHaveLength(1);

    const kept = applyPaymentLedger(
      [{ ...invoice, payments: [{ id: "overlay-pay", amount: 100, method: "Check" }] }],
      ledger
    );
    expect(kept[0].payments[0].id).toBe("overlay-pay");
    expect(applyPaymentLedger([{ ...invoice }], { jobs: ledger.jobs })).toEqual([{ ...invoice }]);
  });
});

describe("payments for a later transfer", () => {
  it("uses the real Zelle row on 260728 and does not invent the discount gap", () => {
    const job = {
      ...invoice,
      payments: [
        {
          id: "pay-20261105-zelle-1",
          amount: 5950,
          date: "2026-11-05",
          method: "Zelle",
          source: "office",
        },
      ],
    };
    const rows = paymentsForTransfer([job]);
    expect(rows).toEqual([
      {
        id: "pay-20261105-zelle-1",
        jobId: "local-260728",
        invoiceNo: "260728",
        amount: 5950,
        date: "2026-11-05",
        method: "Zelle",
        ref: "",
        qboPaymentId: "",
        source: "office",
        deletedJob: false,
      },
    ]);
    const gross = 13300;
    const net = gross - 450;
    expect(net - ledgerPaid(job)).toBe(6900);
    expect(rows[0].amount).toBe(5950);

    const again = paymentsForTransfer([job, job]);
    expect(again).toHaveLength(1);
    expect(again[0].id).toBe(rows[0].id);
  });

  it("does not create a payment from a paid flag or a deleted tombstone", () => {
    const paidOnly = { id: "qbo-1", invoiceNo: "251000", amount: "$80", openBalance: "$0", paid: true };
    expect(paymentsForTransfer([paidOnly])).toEqual([]);
    expect(ledgerPaid(paidOnly)).toBe(0);

    const tomb = {
      id: "qbo-2",
      invoiceNo: "251001",
      amount: "$40",
      payments: [{ id: "pay-dead", amount: 40, date: "2026-01-01", method: "Check", _deleted: true }],
    };
    expect(paymentsForTransfer([tomb])).toEqual([]);

    const deletedJob = {
      id: "qbo-3",
      invoiceNo: "251002",
      _deleted: true,
      amount: "$367",
      payments: [{ id: "pay-keep", amount: 367, date: "2026-02-01", method: "ACH" }],
    };
    const kept = paymentsForTransfer([deletedJob]);
    expect(kept).toHaveLength(1);
    expect(kept[0].deletedJob).toBe(true);
    expect(kept[0].id).toBe("pay-keep");
  });
});
