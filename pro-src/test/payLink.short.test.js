import { describe, expect, it } from "vitest";
import { isShortPayCode, buildPayLandingPayload } from "../src/lib/payLanding.js";
import { buildPaymentLinkEmail } from "../src/lib/paymentLinkEmail.js";

describe("short pay links", () => {
  it("recognizes short codes vs long tokens", () => {
    expect(isShortPayCode("251825-x7k2")).toBe(true);
    expect(isShortPayCode("251825-AB12")).toBe(true);
    expect(isShortPayCode("not-short")).toBe(false);
    expect(isShortPayCode("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0")).toBe(false);
  });

  it("email uses short URL on its own line for easy button styling", () => {
    const short = "https://leelectrical.us/pay/251825-x7k2";
    const { subject, body } = buildPaymentLinkEmail({
      job: { customer: "Golan Chakov", title: "Panel", amount: "$10,000", openBalance: 10000 },
      url: short,
      linkAmount: "10000",
      inv: "251825",
    });
    expect(subject).toContain("251825");
    expect(body).toContain(short);
    expect(body).not.toContain("/app/pro/#/pay/");
    expect(body).toContain("Pay securely online:");
    expect(body).toContain("Questions?");
  });

  it("payload builder still includes invoice for short-link registration", () => {
    const payload = buildPayLandingPayload({
      job: { customer: "Test", invoiceNo: "251825", openBalance: 500 },
      cardknoxUrl: "https://secure.cardknox.com/blzelectric?xAmount=500",
      linkAmount: "500",
      inv: "251825",
    });
    expect(payload.i).toBe("251825");
    expect(payload.pay).toContain("cardknox");
  });
});