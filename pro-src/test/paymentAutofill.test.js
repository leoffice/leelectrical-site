import { describe, expect, it } from "vitest";
import { invoiceNoFromExtracted, paymentAutofillPatch, paymentMemoNote } from "../src/lib/paymentAutofill.js";

describe("paymentAutofill", () => {
  it("maps extracted fields to form patch", () => {
    const patch = paymentAutofillPatch({
      amount: 1500,
      confirmationNumber: "JPM123",
      date: "2026-07-09",
      memo: "inv 251841",
    });
    expect(patch).toEqual({
      amt: "1500",
      ref: "JPM123",
      dt: "2026-07-09",
      memo: "inv 251841",
    });
  });

  it("pulls invoice # from memo or explicit field", () => {
    expect(invoiceNoFromExtracted({ invoiceNumber: "251841" })).toBe("251841");
    expect(invoiceNoFromExtracted({ memo: "Inv #231595 final" })).toBe("231595");
    expect(invoiceNoFromExtracted({ memo: "for job 251841" })).toBe("251841");
    expect(invoiceNoFromExtracted({ memo: "no numbers here" })).toBe("");
  });

  it("builds check memo note with ref, deposit, and memo", () => {
    expect(
      paymentMemoNote({ method: "Check", ref: "1042", deposit: "Martin Dorkin", memo: "251841 work" })
    ).toBe("Check #1042 · Deposit: Martin Dorkin · 251841 work");
  });

  it("builds Zelle memo note", () => {
    expect(
      paymentMemoNote({ method: "Zelle", ref: "JPM1", memo: "partial", proofName: "z.png" })
    ).toBe("Zelle ref JPM1 · proof: z.png · partial");
  });
});
