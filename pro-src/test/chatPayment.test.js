import { describe, expect, it } from "vitest";
import {
  DEPOSIT_BANKS,
  buildChatPaymentDraft,
  isPaymentMethodOnly,
  looksLikePaymentImage,
  parsePaymentMethodHint,
  resolvePaymentKind,
  shouldAutoOpenPaymentDraft,
} from "../src/lib/chatPayment.js";

describe("chatPayment", () => {
  it("parsePaymentMethodHint reads check, zelle, and zell", () => {
    expect(parsePaymentMethodHint("check")).toBe("Check");
    expect(parsePaymentMethodHint("Zelle")).toBe("Zelle");
    expect(parsePaymentMethodHint("zell")).toBe("Zelle");
    expect(parsePaymentMethodHint("record this zelle payment")).toBe("Zelle");
    expect(parsePaymentMethodHint("this is a check deposit")).toBe("Check");
    expect(parsePaymentMethodHint("hello")).toBeNull();
  });

  it("shouldAutoOpenPaymentDraft when text names the payment type", () => {
    expect(shouldAutoOpenPaymentDraft("this is a check deposit")).toBe(true);
    expect(shouldAutoOpenPaymentDraft("zelle")).toBe(true);
    expect(shouldAutoOpenPaymentDraft("hello")).toBe(false);
  });

  it("isPaymentMethodOnly matches single-word hints", () => {
    expect(isPaymentMethodOnly("check")).toBe(true);
    expect(isPaymentMethodOnly("zell")).toBe(true);
    expect(isPaymentMethodOnly("zelle payment")).toBe(false);
  });

  it("resolvePaymentKind prefers chat text over vision", () => {
    expect(resolvePaymentKind({ textHint: "check", visionKind: "zelle", extracted: {} })).toEqual({
      kind: "Check",
      locked: true,
    });
    expect(resolvePaymentKind({ textHint: "", visionKind: "check", extracted: { checkNumber: "12" } })).toEqual({
      kind: "Check",
      locked: false,
    });
  });

  it("buildChatPaymentDraft pulls invoice # from memo and locks method from text", () => {
    const draft = buildChatPaymentDraft({
      extracted: { amount: 1200, memo: "inv 251841 work", checkNumber: "5521" },
      visionKind: "check",
      file: { name: "proof.jpg" },
      previewUrl: "blob:x",
      textHint: "zelle",
      jobInvoiceNo: "",
    });
    expect(draft.kind).toBe("Zelle");
    expect(draft.methodLocked).toBe(true);
    expect(draft.invoiceNo).toBe("251841");
    expect(draft.amount).toBe("1200");
    expect(draft.ref).toBe("5521");
    expect(draft.deposit).toBe(DEPOSIT_BANKS[0]);
  });

  it("looksLikePaymentImage detects amount or refs", () => {
    expect(looksLikePaymentImage({ amount: 100 })).toBe(true);
    expect(looksLikePaymentImage({ checkNumber: "1" })).toBe(true);
    expect(looksLikePaymentImage({})).toBe(false);
  });
});