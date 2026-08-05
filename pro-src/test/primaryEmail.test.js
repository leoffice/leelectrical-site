import { describe, expect, it } from "vitest";
import { primaryEmailForPayment } from "../src/lib/primaryEmail.js";
import { billingFromJob, billingFromLanding } from "../src/lib/solaCharge.js";
import { buildSolaPayUrl } from "../src/lib/solaPayUrl.js";
import { buildPayLandingPayload } from "../src/lib/payLanding.js";

describe("primaryEmailForPayment (Cardknox E40)", () => {
  it("returns first of comma/semicolon multi-email (Shaina #251719 shape)", () => {
    expect(primaryEmailForPayment("sheina@abbarealestate.com , levin.sfr@gmail.com")).toBe(
      "sheina@abbarealestate.com"
    );
    expect(primaryEmailForPayment("a@x.com; b@y.com")).toBe("a@x.com");
  });

  it("handles single email and empty", () => {
    expect(primaryEmailForPayment("only@example.com")).toBe("only@example.com");
    expect(primaryEmailForPayment("")).toBe("");
    expect(primaryEmailForPayment(null)).toBe("");
  });

  it("billingFromJob/landing strip multi-email for gateway", () => {
    expect(
      billingFromJob({
        customer: "LMR Properties",
        email: "sheina@abbarealestate.com , levin.sfr@gmail.com",
      }).email
    ).toBe("sheina@abbarealestate.com");
    expect(
      billingFromLanding({ e: "tfass@bethrivkah.edu, operations@bethrivkah.edu" }).email
    ).toBe("tfass@bethrivkah.edu");
  });

  it("buildSolaPayUrl xEmail is a single address", () => {
    const url = buildSolaPayUrl({
      slug: "blzelectric",
      amount: 400,
      invoiceNo: "251719",
      email: "sheina@abbarealestate.com , levin.sfr@gmail.com",
    });
    expect(url).toContain("xEmail=sheina%40abbarealestate.com");
    expect(url).not.toMatch(/xEmail=.*%2C/);
    expect(url).not.toContain("levin.sfr");
  });

  it("pay landing payload e is single email", () => {
    const payload = buildPayLandingPayload({
      job: {
        id: "qbo-251719",
        invoiceNo: "251719",
        customer: "LMR Properties",
        email: "sheina@abbarealestate.com , levin.sfr@gmail.com",
        amount: "$400",
        openBalance: "$400",
      },
      cardknoxUrl: "https://secure.cardknox.com/blzelectric",
      linkAmount: 400,
    });
    expect(payload.e).toBe("sheina@abbarealestate.com");
  });
});
