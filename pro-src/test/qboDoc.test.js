import { describe, expect, it } from "vitest";
import {
  buildDocCommandPayload,
  initialLines,
  lineAmount,
  linesTotal,
  scaleLines,
  shipAddrPayload,
} from "../src/lib/qboDoc.js";

describe("qboDoc", () => {
  const job = {
    id: "J-1",
    customer: "Test Co",
    title: "Panel",
    amount: "$1,000",
    serviceAddress: "123 Main St",
    apartment: "4B",
    estimateLines: [{ itemName: "Service call:Service call", qty: 1, unitPrice: 120, description: "Visit" }],
    estimateNo: "E-100",
    invoiceNo: "251800",
  };

  it("lineAmount and linesTotal", () => {
    expect(lineAmount({ qty: 2, unitPrice: 110 })).toBe(220);
    expect(linesTotal([{ qty: 1, unitPrice: 120 }, { qty: 2, unitPrice: 50 }])).toBe(220);
    // Missing qty defaults to 1; amount-only lines work
    expect(lineAmount({ unitPrice: 110 })).toBe(110);
    expect(lineAmount({ amount: 2300, qty: 1 })).toBe(2300);
    // Explicit zero qty stays zero (progress not yet billed)
    expect(lineAmount({ qty: 0, unitPrice: 5000 })).toBe(0);
  });

  it("scaleLines applies progress percent to unit price", () => {
    const scaled = scaleLines(job.estimateLines, 50);
    expect(scaled[0].unitPrice).toBe(60);
    expect(scaled[0].description).toContain("50%");
  });

  it("initialLines from estimate for invoice at progress uses QBO qty style", () => {
    const lines = initialLines(job, { kind: "invoice", mode: "from_estimate", progressPct: 25 });
    expect(lines[0].unitPrice).toBe(120);
    expect(lines[0].qty).toBe(0.25);
  });

  it("turn_from_estimate keeps all estimate lines (not a single amount line)", () => {
    const multi = {
      ...job,
      amount: "$500",
      invoiceLines: [],
      estimateLines: [
        { itemName: "Service call", qty: 1, unitPrice: 120, description: "Visit" },
        { itemName: "Labor", qty: 2, unitPrice: 95, description: "Rough-in" },
        { itemName: "Materials", qty: 1, unitPrice: 200, description: "Wire" },
      ],
    };
    const lines = initialLines(multi, {
      kind: "invoice",
      mode: "turn_from_estimate",
      progressPct: 100,
    });
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.itemName)).toEqual(["Service call", "Labor", "Materials"]);
    expect(lines[1].qty).toBe(2);
    expect(lines[1].unitPrice).toBe(95);
  });

  it("turn_from_estimate at partial progress scales every estimate line", () => {
    const multi = {
      ...job,
      amount: "$500",
      invoiceLines: [],
      estimateLines: [
        { itemName: "A", qty: 1, unitPrice: 100 },
        { itemName: "B", qty: 1, unitPrice: 100 },
      ],
    };
    const lines = initialLines(multi, {
      kind: "invoice",
      mode: "turn_from_estimate",
      progressPct: 50,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0].qty).toBe(0.5);
    expect(lines[0].unitPrice).toBe(100);
  });

  it("buildDocCommandPayload includes ShipAddr and QBO line shape", () => {
    const lines = [{ itemName: "Installation:Ballast Replacement", qty: 1, unitPrice: 110, description: "Ballast" }];
    const payload = buildDocCommandPayload(job, {
      kind: "invoice",
      lines,
      serviceAddress: "123 Main St",
      apartment: "4B",
      mode: "from_estimate",
      progressPct: 50,
      send: true,
    });
    expect(payload.shipAddr).toEqual({ Line1: "123 Main St", Line2: "4B" });
    expect(payload.lines[0].itemName).toBe("Installation:Ballast Replacement");
    expect(payload.source).toBe("estimate");
    expect(payload.progressPct).toBe(50);
    expect(payload.send).toBe(true);
    expect(payload.invoiceNo).toBe("251800");
    expect(shipAddrPayload("99 Oak", "")).toEqual({ Line1: "99 Oak" });
  });
});