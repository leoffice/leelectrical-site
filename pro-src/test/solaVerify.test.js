import { describe, expect, it } from "vitest";
import {
  indexJobPaymentRefs,
  summarizeSolaVerify,
  verifySolaTransactions,
} from "../src/lib/solaVerify.js";

describe("solaVerify", () => {
  const jobs = [
    {
      id: "local-goodness",
      customer: "Goodness and kindness",
      invoiceNo: "LE-2712",
      payments: [
        { id: "sola-a", amount: "$2300", ref: "10997044786", method: "Credit card", source: "sola" },
        { id: "qbo-partial", amount: "$1800", ref: "11007297431", method: "Credit card", source: "qbo" },
        { id: "sola-b", amount: "$4600", ref: "11007421537", method: "Credit card", source: "sola" },
      ],
    },
  ];

  it("indexes payment refs from jobs", () => {
    const map = indexJobPaymentRefs(jobs);
    expect(map.get("10997044786")?.[0]?.invoiceNo).toBe("LE-2712");
    expect(map.get("11007297431")?.[0]?.amount).toBe(1800);
  });

  it("marks matched / mismatch / missing / declined", () => {
    const rows = verifySolaTransactions(
      [
        {
          ref: "10997044786",
          approved: true,
          principalAmount: 2300,
          chargeAmount: 2380.5,
        },
        {
          ref: "11007297431",
          approved: true,
          principalAmount: 4600,
          chargeAmount: 4761,
        },
        {
          ref: "11007421537",
          approved: true,
          principalAmount: 4600,
          chargeAmount: 4761,
        },
        {
          ref: "ghost-ref",
          approved: true,
          principalAmount: 100,
          chargeAmount: 103.5,
          jobId: "local-goodness",
        },
        {
          ref: "declined-1",
          approved: false,
          declined: true,
          principalAmount: 2300,
          chargeAmount: 2380.5,
        },
      ],
      jobs
    );
    expect(rows.find((r) => r.ref === "10997044786").match).toBe("matched");
    expect(rows.find((r) => r.ref === "11007297431").match).toBe("amount_mismatch");
    expect(rows.find((r) => r.ref === "11007421537").match).toBe("matched");
    expect(rows.find((r) => r.ref === "ghost-ref").match).toBe("missing_in_app");
    expect(rows.find((r) => r.ref === "declined-1").match).toBe("declined");
  });

  it("summarizes match buckets", () => {
    const summary = summarizeSolaVerify([
      { match: "matched" },
      { match: "matched" },
      { match: "missing_in_app" },
      { match: "amount_mismatch" },
      { match: "declined" },
    ]);
    expect(summary).toEqual({
      matched: 2,
      missing_in_app: 1,
      amount_mismatch: 1,
      declined: 1,
      voided: 0,
      other: 0,
    });
  });
});
