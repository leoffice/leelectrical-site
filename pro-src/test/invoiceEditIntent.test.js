import { describe, expect, it } from "vitest";
import { findLineIndex, parseInvoiceEditIntent } from "../src/lib/invoiceEditIntent.js";

const LINES = [
  { itemName: "Labor", description: "Electrical labor", qty: 1, unitPrice: 400 },
  { itemName: "Permit fee", description: "DOB permit", qty: 1, unitPrice: 150 },
];

describe("parseInvoiceEditIntent", () => {
  it("parses change labor to $450", () => {
    const r = parseInvoiceEditIntent("change labor to $450");
    expect(r).not.toBeNull();
    expect(r.actions[0]).toMatchObject({ type: "set_amount", match: "labor", amount: 450 });
  });

  it("parses add panel upgrade line $1200", () => {
    const r = parseInvoiceEditIntent("add panel upgrade line $1200");
    expect(r.actions[0]).toMatchObject({ type: "add_line", itemName: "panel upgrade", amount: 1200 });
  });

  it("parses remove permit fee", () => {
    const r = parseInvoiceEditIntent("remove permit fee");
    expect(r.actions[0]).toMatchObject({ type: "remove_line", match: "permit fee" });
  });

  it("returns null for unrelated chat", () => {
    expect(parseInvoiceEditIntent("call customer tomorrow")).toBeNull();
    expect(parseInvoiceEditIntent("/job notes hi")).toBeNull();
  });
});

describe("findLineIndex", () => {
  it("matches labor and permit fee lines", () => {
    expect(findLineIndex(LINES, "labor")).toBe(0);
    expect(findLineIndex(LINES, "permit")).toBe(1);
  });
});