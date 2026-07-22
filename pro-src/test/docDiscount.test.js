import { describe, expect, it } from "vitest";
import {
  discountCommandFields,
  discountInputFromJob,
  discountJobPatch,
  docTotalAfterDiscount,
  resolveDiscountAmount,
} from "../src/lib/docDiscount.js";
import { planDocSaveLocal, planDocSaveSync } from "../src/lib/docSync.js";
import { buildDocCommandPayload } from "../src/lib/qboDoc.js";
import { mapJobToQbDocData } from "../src/lib/jobToQbDoc.js";
import { buildQbDocPdf } from "../src/lib/qbInvoicePdf.js";

describe("docDiscount helpers", () => {
  it("resolves dollar discount capped at subtotal", () => {
    expect(resolveDiscountAmount(1000, { type: "amount", value: 150 })).toBe(150);
    expect(resolveDiscountAmount(100, { type: "amount", value: 150 })).toBe(100);
    expect(resolveDiscountAmount(1000, { type: "amount", value: 0 })).toBe(0);
  });

  it("resolves percent discount off the total", () => {
    expect(resolveDiscountAmount(1000, { type: "percent", value: 10 })).toBe(100);
    expect(resolveDiscountAmount(250, { type: "percent", value: 20 })).toBe(50);
    expect(docTotalAfterDiscount(1000, { type: "percent", value: 10 })).toBe(900);
  });

  it("reads discount from saved job fields", () => {
    expect(discountInputFromJob({ discountType: "percent", discountPercent: 15 })).toEqual({
      type: "percent",
      value: 15,
    });
    expect(discountInputFromJob({ discount: 75 })).toEqual({ type: "amount", value: 75 });
  });

  it("builds job patch with resolved dollars", () => {
    expect(discountJobPatch(2000, { type: "percent", value: 5 })).toMatchObject({
      discount: 100,
      discountType: "percent",
      discountPercent: 5,
    });
    expect(discountJobPatch(500, { type: "amount", value: 50 })).toMatchObject({
      discount: 50,
      discountType: "amount",
    });
  });

  it("command fields carry percent-based flag for QBO", () => {
    const fields = discountCommandFields(
      { discountType: "percent", discountPercent: 10, discount: 100 },
      1000
    );
    expect(fields.percentBased).toBe(true);
    expect(fields.discountPercent).toBe(10);
    expect(fields.discount).toBe(100);
  });
});

describe("doc save with discount", () => {
  const job = {
    id: "J-D",
    customer: "Discount Co",
    serviceAddress: "1 Main",
    email: "d@x.com",
    qboCustomerId: "99",
  };
  const lines = [{ itemName: "Labor", description: "Work", qty: 1, unitPrice: 1000 }];

  it("planDocSaveLocal stores discounted amount", () => {
    const { jobPatch } = planDocSaveLocal(job, {
      kind: "invoice",
      mode: "create",
      lines,
      serviceAddress: "1 Main",
      apartment: "",
      discountType: "percent",
      discountValue: 10,
    });
    expect(jobPatch.amount).toMatch(/900/);
    expect(jobPatch.discount).toBe(100);
    expect(jobPatch.discountType).toBe("percent");
    expect(jobPatch.discountPercent).toBe(10);
  });

  it("planDocSaveSync puts discount on create_invoice payload", () => {
    const { commands, jobPatch } = planDocSaveSync(job, {
      kind: "invoice",
      mode: "create",
      lines,
      serviceAddress: "1 Main",
      apartment: "",
      send: false,
      discountType: "amount",
      discountValue: 250,
    });
    expect(jobPatch.discount).toBe(250);
    expect(commands[0].type).toBe("create_invoice");
    expect(commands[0].payload.discount).toBe(250);
    expect(commands[0].payload.total).toBe(750);
    expect(commands[0].payload.percentBased).toBe(false);
  });

  it("buildDocCommandPayload includes percent discount", () => {
    const payload = buildDocCommandPayload(
      { ...job, discountType: "percent", discountPercent: 20, discount: 200 },
      { kind: "invoice", lines, serviceAddress: "1 Main", apartment: "", mode: "create" }
    );
    expect(payload.discount).toBe(200);
    expect(payload.discountPercent).toBe(20);
    expect(payload.total).toBe(800);
  });
});

describe("PDF shows discount", () => {
  it("mapJobToQbDocData + buildQbDocPdf include DISCOUNT", async () => {
    const data = mapJobToQbDocData(
      {
        customer: "A",
        invoiceNo: "251901",
        amount: "$900",
        discount: 100,
        invoiceLines: [{ description: "Panel", qty: 1, unitPrice: 1000 }],
      },
      "invoice"
    );
    expect(data.discount).toBe(100);
    expect(data.total).toBe(900);
    const blob = buildQbDocPdf(data);
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    expect(s).toContain("DISCOUNT");
    expect(s).toContain("SUBTOTAL");
  });
});
