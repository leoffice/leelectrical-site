import { describe, expect, it } from "vitest";
import {
  hasUsefulPaymentAutofill,
  invoiceNoFromExtracted,
  parseExtractedAmount,
  paymentAutofillPatch,
  paymentMemoNote,
} from "../src/lib/paymentAutofill.js";

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
      invoiceNo: "251841",
    });
  });

  it("maps check payer name and invoice for matching", () => {
    const patch = paymentAutofillPatch({
      amount: 850,
      checkNumber: "1042",
      confirmationNumber: "1042",
      date: "2026-07-20",
      memo: "251841",
      payer: "Shaina Levin",
      invoiceNumber: "251841",
    });
    expect(patch.amt).toBe("850");
    expect(patch.ref).toBe("1042");
    expect(patch.dt).toBe("2026-07-20");
    expect(patch.name).toBe("Shaina Levin");
    expect(patch.invoiceNo).toBe("251841");
  });

  it("pulls invoice # from memo or explicit field", () => {
    expect(invoiceNoFromExtracted({ invoiceNumber: "251841" })).toBe("251841");
    expect(invoiceNoFromExtracted({ memo: "Inv #231595 final" })).toBe("231595");
    expect(invoiceNoFromExtracted({ memo: "for job 251841" })).toBe("251841");
    expect(invoiceNoFromExtracted({ memo: "no numbers here" })).toBe("");
  });

  it("treats a bare memo number as the invoice #", () => {
    expect(invoiceNoFromExtracted({ memo: "251841" })).toBe("251841");
    expect(invoiceNoFromExtracted({ memo: "#231595" })).toBe("231595");
    expect(invoiceNoFromExtracted({ memo: "  251808  " })).toBe("251808");
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

  it("parses string amounts and rejects empty extracts as not useful", () => {
    expect(parseExtractedAmount("$1,250.50")).toBe(1250.5);
    expect(parseExtractedAmount(null)).toBe(null);
    expect(hasUsefulPaymentAutofill(null)).toBe(false);
    expect(hasUsefulPaymentAutofill({})).toBe(false);
    expect(hasUsefulPaymentAutofill({ amount: 100, checkNumber: "12" })).toBe(true);
    expect(paymentAutofillPatch({ amount: "$80.00", checkNumber: "99" })).toEqual({
      amt: "80",
      ref: "99",
    });
  });
});
