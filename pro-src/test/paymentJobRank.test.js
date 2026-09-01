import { describe, it, expect } from "vitest";
import { scoreJobForPayment, rankJobsForPayment } from "../src/lib/paymentJobRank.js";

describe("paymentJobRank", () => {
  const sternbergPaid = {
    id: "local-stern",
    customer: "Yossi Sternberg",
    invoiceNo: "",
    openBalance: 0,
    paid: true,
  };
  const sternbergOpen = {
    id: "local-stern-open",
    customer: "Yossi Sternberg",
    invoiceNo: "259999",
    openBalance: 4100,
    paid: false,
  };
  const otherOpen = {
    id: "qbo-1",
    customer: "Someone Else",
    invoiceNo: "100",
    openBalance: 4100,
    paid: false,
  };

  it("Yosef Sternberg query finds Yossi even with no open invoice", () => {
    const score = scoreJobForPayment(sternbergPaid, { query: "Yosef Sternberg", amount: 4100 });
    expect(score).toBeGreaterThan(0);
  });

  it("without a name query, paid zero-balance jobs stay hidden", () => {
    expect(scoreJobForPayment(sternbergPaid, { amount: 4100 })).toBe(-1);
  });

  it("ranks Yosef Sternberg query above amount-only strangers", () => {
    const ranked = rankJobsForPayment([otherOpen, sternbergOpen, sternbergPaid], {
      query: "Yosef Sternberg",
      amount: 4100,
      fromName: "Yosef Sternberg",
    });
    expect(ranked[0].job.customer).toMatch(/Sternberg/i);
  });

  it("fromName Yosef boosts Yossi Sternberg", () => {
    const score = scoreJobForPayment(sternbergOpen, {
      amount: 4100,
      fromName: "Yosef Sternberg",
    });
    expect(score).toBeGreaterThan(scoreJobForPayment(otherOpen, { amount: 4100, fromName: "Yosef Sternberg" }));
  });
});
