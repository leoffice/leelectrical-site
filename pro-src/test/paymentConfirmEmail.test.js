import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildPaymentConfirmEmail } from "../../netlify/functions/lib/paymentConfirmEmail.mjs";
import {
  isEmailTestMode,
  resolveRecipient,
  resolveFromAddress,
} from "../../netlify/functions/lib/paymentConfirmEnv.mjs";

describe("buildPaymentConfirmEmail", () => {
  it("builds subject and receipt fields matching post-payment window", () => {
    const { subject, html, text } = buildPaymentConfirmEmail({
      firstName: "Moshe",
      invoiceNo: "251839",
      amountPaid: 652,
      balanceNow: 0,
      payDate: "2026-07-09",
    });
    expect(subject).toContain("Invoice #251839");
    expect(subject).toContain("BLZ Electric");
    expect(html).toContain("BLZ Electric");
    expect(html).toContain("Payment received");
    expect(html).toContain("#251839");
    expect(html).toContain("$652");
    expect(html).toContain("Paid in full");
    expect(html).toContain("July 9, 2026");
    expect(text).toContain("Hi Moshe");
    expect(text).toContain("Paid in full");
  });

  it("shows remaining balance when not paid in full", () => {
    const { html } = buildPaymentConfirmEmail({
      invoiceNo: "231315",
      amountPaid: 10000,
      balanceNow: 1000,
      payDate: "2026-07-09",
    });
    expect(html).toContain("$10,000");
    expect(html).toContain("$1,000");
    expect(html).not.toContain("Paid in full");
  });
});

describe("payment confirm email env helpers", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("defaults to test mode when EMAIL_TEST_MODE unset", () => {
    delete process.env.EMAIL_TEST_MODE;
    expect(isEmailTestMode()).toBe(true);
  });

  it("goes live only when EMAIL_TEST_MODE=false", () => {
    process.env.EMAIL_TEST_MODE = "false";
    expect(isEmailTestMode()).toBe(false);
  });

  it("routes to test inbox in test mode", () => {
    process.env.EMAIL_TEST_MODE = "true";
    process.env.PAYMENT_CONFIRM_TEST_EMAIL = "levi@test.com";
    expect(resolveRecipient("customer@example.com")).toBe("levi@test.com");
  });

  it("sends to customer when live", () => {
    process.env.EMAIL_TEST_MODE = "false";
    expect(resolveRecipient("customer@example.com")).toBe("customer@example.com");
  });

  it("defaults from address to office@leelectrical.us (same mailbox for everything)", () => {
    delete process.env.PAYMENT_CONFIRM_FROM;
    delete process.env.EMAIL_FROM;
    expect(resolveFromAddress()).toBe("office@leelectrical.us");
  });

  it("honors PAYMENT_CONFIRM_FROM when set", () => {
    process.env.PAYMENT_CONFIRM_FROM = "billing@example.com";
    expect(resolveFromAddress()).toBe("billing@example.com");
  });
});