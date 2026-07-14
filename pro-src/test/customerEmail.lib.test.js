import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { sendCustomerEmail } from "../../netlify/functions/lib/customerEmail.mjs";

describe("customerEmail lib", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_TEST_MODE = "true";
    process.env.PAYMENT_CONFIRM_TEST_EMAIL = "levi@test.com";
  });

  afterEach(() => {
    process.env = env;
  });

  it("dry-runs without RESEND_API_KEY", async () => {
    const r = await sendCustomerEmail({
      to: "customer@example.com",
      subject: "Test",
      message: "Hello there",
    });
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
  });

  it("rejects empty message", async () => {
    const r = await sendCustomerEmail({ to: "a@b.com", subject: "Hi", message: "" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("empty_message");
  });
});