import { describe, expect, it } from "vitest";
import { buildPaymentLinkEmail } from "../src/lib/paymentLinkEmail.js";

describe("buildPaymentLinkEmail", () => {
  it("explains total vs balance due and includes the link", () => {
    const { subject, body } = buildPaymentLinkEmail({
      job: {
        customer: "Golan Chakov",
        title: "Panel upgrade",
        amount: "$41,000",
        openBalance: 10000,
        invoiceNo: "231315",
      },
      url: "https://secure.cardknox.com/demo?xamount=10000",
      linkAmount: "10000",
      inv: "231315",
    });
    expect(subject).toContain("231315");
    expect(body).toContain("Invoice total");
    expect(body).toContain("Balance due");
    expect(body).toContain("https://secure.cardknox.com/demo");
    expect(body).toContain("Golan");
  });
});