import { describe, expect, it } from "vitest";
import { parseVisionJson } from "../../netlify/functions/lib/zelleVision.mjs";
import {
  normalizeExtracted,
  normalizeIntentExtracted,
  normalizePaymentExtracted,
} from "../../netlify/functions/lib/paymentVision.mjs";

describe("parseVisionJson", () => {
  it("parses raw JSON", () => {
    const o = parseVisionJson('{"amount":2300,"confirmationNumber":"JPM1"}');
    expect(o.amount).toBe(2300);
  });
  it("parses fenced JSON", () => {
    const o = parseVisionJson('```json\n{"amount":100}\n```');
    expect(o.amount).toBe(100);
  });
});

describe("normalizeExtracted", () => {
  it("normalizes amount and date", () => {
    const n = normalizeExtracted({
      amount: "$2,300",
      confirmationNumber: " JPM99 ",
      date: "07/09/26",
      memo: "inv 251841",
      confidence: "high",
    });
    expect(n.amount).toBe(2300);
    expect(n.confirmationNumber).toBe("JPM99");
    expect(n.date).toBe("2026-07-09");
    expect(n.confidence).toBe("high");
  });

  it("normalizes image intent fields", () => {
    const n = normalizeIntentExtracted({
      documentType: "payment",
      invoiceNumbers: ["251808", "x"],
      addresses: ["55 Elm St"],
      amount: 1200,
      paymentMethod: "zelle",
      memo: "thanks",
      confidence: "high",
    });
    expect(n.invoiceNumbers).toEqual(["251808"]);
    expect(n.addresses).toEqual(["55 Elm St"]);
    expect(n.amount).toBe(1200);
    expect(n.documentType).toBe("payment");
  });

  it("normalizes check fields", () => {
    const n = normalizePaymentExtracted(
      {
        amount: 500,
        checkNumber: "1042",
        date: "07/10/26",
        memo: "251841",
        payer: "Shaina Levin",
        payee: "LE Electrical",
        confidence: "high",
      },
      "check"
    );
    expect(n.confirmationNumber).toBe("1042");
    expect(n.checkNumber).toBe("1042");
    expect(n.kind).toBe("check");
    expect(n.payer).toBe("Shaina Levin");
    expect(n.payee).toBe("LE Electrical");
    expect(n.name).toBe("Shaina Levin");
    // Bare memo digits → invoice #
    expect(n.invoiceNumber).toBe("251841");
  });

  it("keeps labeled invoice over bare check confusion", () => {
    const n = normalizePaymentExtracted(
      {
        amount: 200,
        checkNumber: "88",
        date: "07/20/2026",
        memo: "Inv 251808",
        invoiceNumber: "251808",
        payer: "Acme LLC",
      },
      "check"
    );
    expect(n.checkNumber).toBe("88");
    expect(n.invoiceNumber).toBe("251808");
    expect(n.date).toBe("2026-07-20");
    expect(n.payer).toBe("Acme LLC");
  });

  it("normalizes Zelle bank-email gold (Miriam Wolf / Wells Fargo)", () => {
    const n = normalizePaymentExtracted(
      {
        amount: 2000,
        confirmationNumber: "BACzsyfc1ixk",
        date: "07/22/2026",
        memo: "157-159 remsen Lein",
        payer: "MIRIAM WOLF",
        depositBank: "Wells Fargo",
        confidence: "high",
      },
      "zelle"
    );
    expect(n.amount).toBe(2000);
    expect(n.confirmationNumber).toBe("BACzsyfc1ixk");
    expect(n.date).toBe("2026-07-22");
    expect(n.payer).toBe("MIRIAM WOLF");
    expect(n.depositBank).toBe("Wells Fargo");
    expect(n.memo).toBe("157-159 remsen Lein");
    expect(n.kind).toBe("zelle");
  });

  it("normalizes Zelle JPM conf + invoice memo + strips bank chrome payer", () => {
    const n = normalizePaymentExtracted(
      {
        amount: "$5,000.00",
        confirmationNumber: "JPM99cpprhp9",
        date: "07/17/2026",
        memo: "Inv 251841",
        fromName: "IKIPPAH LLC",
        depositBank: "Wells Fargo",
      },
      "zelle"
    );
    expect(n.amount).toBe(5000);
    expect(n.confirmationNumber).toBe("JPM99cpprhp9");
    expect(n.payer).toBe("IKIPPAH LLC");
    expect(n.invoiceNumber).toBe("251841");
    expect(n.depositBank).toBe("Wells Fargo");

    const chrome = normalizePaymentExtracted(
      { amount: 100, confirmationNumber: "X1", payer: "Wells Fargo home page" },
      "zelle"
    );
    expect(chrome.payer).toBe("");
  });
});
