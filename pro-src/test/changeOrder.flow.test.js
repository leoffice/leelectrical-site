// Change order numbering, carousel visibility, connect docs, tab rows.
import { describe, expect, it } from "vitest";
import {
  bestChangeOrderSource,
  briefJobTitleFromDoc,
  buildChangeOrderLinesFromQbo,
  canAddChangeOrder,
  carouselVisibleJobs,
  changeOrderDisplayName,
  changeOrderDocLabel,
  changeOrderJobPatch,
  changeOrderReadyForCarousel,
  changeOrderTabRows,
  connectDocsPatch,
  isChangeOrderJob,
  nextChangeOrderSeq,
  preferredChangeOrderDocNo,
  seqFromCoPi,
  tagChangeOrderPatch,
  textLooksLikeChangeOrder,
} from "../src/lib/changeOrder.js";
import { buildDocCommandPayload } from "../src/lib/qboDoc.js";
import { planDocSaveSync } from "../src/lib/docSync.js";

const BASE = {
  id: "J-1",
  customer: "Acme",
  qboCustomerId: "55",
  serviceAddress: "10 Oak St",
  invoiceNo: "251100",
  estimateNo: "25400",
  title: "Panel upgrade",
  _invoiceConfirmed: true,
  _estimateConfirmed: true,
  _docEmailed: true,
};

describe("changeOrder numbering", () => {
  it("assigns CO suffix from source invoice number", () => {
    expect(changeOrderDocLabel(BASE, "invoice", 1)).toBe("251100-CO-1");
    expect(changeOrderDocLabel(BASE, "estimate", 2)).toBe("25400-CO-2");
  });

  it("does not nest CO suffixes on the base number", () => {
    expect(changeOrderDocLabel({ invoiceNo: "251100-CO-1" }, "invoice", 2)).toBe("251100-CO-2");
  });

  it("increments sequence per source + kind", () => {
    const jobs = [
      BASE,
      { id: "J-2", changeOrder: true, changeOrderSourceId: "J-1", changeOrderKind: "invoice" },
    ];
    expect(nextChangeOrderSeq(jobs, BASE, "invoice")).toBe(2);
    expect(nextChangeOrderSeq(jobs, BASE, "estimate")).toBe(1);
  });

  it("patch tags source and clears doc numbers", () => {
    const p = changeOrderJobPatch(BASE, "invoice", [BASE]);
    expect(p.changeOrder).toBe(true);
    expect(p.changeOrderSourceId).toBe("J-1");
    expect(p.changeOrderSeq).toBe(1);
    expect(p.changeOrderLabel).toBe("251100-CO-1");
    expect(p.invoiceNo).toBe("");
    expect(p.title).toMatch(/Change Order 1/);
  });

  it("preferredChangeOrderDocNo uses original-CO-seq for generate", () => {
    const p = changeOrderJobPatch(BASE, "invoice", [BASE]);
    expect(preferredChangeOrderDocNo(p, "invoice")).toBe("251100-CO-1");
  });

  it("create_invoice payload uses CO doc number", () => {
    const coJob = {
      ...changeOrderJobPatch(BASE, "invoice", [BASE]),
      id: "J-co",
    };
    const payload = buildDocCommandPayload(coJob, {
      kind: "invoice",
      lines: [{ itemName: "General electrical work", qty: 1, unitPrice: 500, description: "Extra outlets" }],
      serviceAddress: "10 Oak St",
      mode: "create",
    });
    expect(payload.invoiceNo).toBe("251100-CO-1");

    const plan = planDocSaveSync(coJob, {
      kind: "invoice",
      mode: "create",
      lines: [{ itemName: "General electrical work", qty: 1, unitPrice: 500, description: "Extra outlets" }],
      serviceAddress: "10 Oak St",
      apartment: "",
    });
    expect(plan.commands[0].type).toBe("create_invoice");
    expect(plan.commands[0].payload.invoiceNo).toBe("251100-CO-1");
    // Local job still has no confirmed invoiceNo so create (not update) is used
    expect(coJob.invoiceNo).toBe("");
  });

  it("bestChangeOrderSource prefers non-CO invoice at address", () => {
    const co = {
      id: "J-co",
      changeOrder: true,
      customer: "Acme",
      qboCustomerId: "55",
      serviceAddress: "10 Oak St",
      invoiceNo: "251100-CO-1",
    };
    const src = bestChangeOrderSource([BASE, co], co);
    expect(src.id).toBe("J-1");
  });

  it("display name is Change Order N", () => {
    expect(changeOrderDisplayName(1)).toBe("Change Order 1");
    expect(changeOrderDisplayName(2, "estimate")).toBe("Change Order Estimate 2");
  });
});

describe("change order detection", () => {
  it("detects CO from title and doc number", () => {
    expect(textLooksLikeChangeOrder("Change order for lighting")).toBe(true);
    expect(isChangeOrderJob({ id: "x", title: "Change order — $120" })).toBe(true);
    expect(isChangeOrderJob({ id: "x", invoiceNo: "251100-CO-2" })).toBe(true);
    expect(isChangeOrderJob(BASE)).toBe(false);
    // Explicit toggle-off wins over title / doc-number heuristics
    expect(isChangeOrderJob({ id: "x", title: "Change order — $120", changeOrder: false })).toBe(false);
    expect(isChangeOrderJob({ id: "x", invoiceNo: "251100-CO-2", changeOrder: false })).toBe(false);
  });

  it("detects CO from QuickBooks CO / PI custom field", () => {
    expect(seqFromCoPi("01")).toBe(1);
    expect(seqFromCoPi("11 (007)")).toBe(11);
    expect(seqFromCoPi("")).toBe(0);
    expect(isChangeOrderJob({ id: "qbo-251702", qboCoPi: "01", title: "Heater" })).toBe(true);
    expect(isChangeOrderJob({ id: "qbo-x", coPi: "02" })).toBe(true);
    expect(isChangeOrderJob(BASE)).toBe(false);
  });

  it("extracts CO lines from QBO line items", () => {
    const lines = buildChangeOrderLinesFromQbo([
      { description: "Base install", amount: 10000 },
      { description: "Change order for extra switches", amount: 5280 },
      { description: "Change order for extra recessed lights.", amount: 9100 },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].changeOrderSeq).toBe(1);
    expect(lines[1].amount).toBe(9100);
  });

  it("tagChangeOrderPatch sets seq and label", () => {
    const p = tagChangeOrderPatch({ id: "J-co", invoiceNo: "251200" }, BASE, 1);
    expect(p.changeOrder).toBe(true);
    expect(p.changeOrderSeq).toBe(1);
    expect(p.changeOrderLabel).toBe("251100-CO-1");
  });
});

describe("change order tab rows", () => {
  it("lists separate CO jobs and CO lines on the original", () => {
    const original = {
      ...BASE,
      invoiceLines: [
        { description: "Main panel upgrade", amount: 8000 },
        { description: "Change order for second floor lights", amount: 1200 },
      ],
      changeOrderLines: [
        { description: "Change order for second floor lights", amount: 1200, changeOrderSeq: 1 },
      ],
    };
    const coJob = {
      id: "J-co2",
      customer: "Acme",
      qboCustomerId: "55",
      serviceAddress: "10 Oak St",
      changeOrder: true,
      changeOrderSourceId: "J-1",
      changeOrderSeq: 2,
      changeOrderLabel: "251100-CO-2",
      invoiceNo: "251101",
      amount: "$500",
      openBalance: "$500",
      paid: false,
      invoiceLines: [{ description: "Extra outlet", amount: 500 }],
    };
    const rows = changeOrderTabRows([original, coJob], original);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.some((r) => r.kind === "job" && r.docNo === "251101")).toBe(true);
    expect(rows.some((r) => r.kind === "line")).toBe(true);
    expect(rows.every((r) => /Change Order/.test(r.label))).toBe(true);
    const coRow = rows.find((r) => r.kind === "job" && r.docNo === "251101");
    expect(coRow.amount).toBe(500);
    expect(coRow.balance).toBe(500);
    expect(coRow.balanceLine).toMatch(/Balance/);
    expect(coRow.amountLine).toMatch(/\$500/);
  });
});

describe("carousel visibility", () => {
  it("hides draft change orders until confirmed, described, and emailed", () => {
    const draft = {
      id: "J-co",
      ...BASE,
      changeOrder: true,
      changeOrderKind: "invoice",
      invoiceNo: "",
      _invoiceConfirmed: false,
      _docEmailed: false,
    };
    expect(changeOrderReadyForCarousel(draft)).toBe(false);
    expect(changeOrderReadyForCarousel(BASE)).toBe(true);
  });

  it("carouselVisibleJobs drops draft CO and merged followers", () => {
    const draft = {
      id: "J-co",
      customer: "Acme",
      qboCustomerId: "55",
      serviceAddress: "10 Oak St",
      changeOrder: true,
      changeOrderKind: "invoice",
    };
    const merged = {
      id: "J-3",
      customer: "Acme",
      qboCustomerId: "55",
      serviceAddress: "10 Oak St",
      invoiceNo: "251101",
      jobInfoLeadId: "J-1",
    };
    const jobs = [BASE, draft, merged];
    const visible = carouselVisibleJobs(jobs, BASE);
    expect(visible.map((j) => j.id)).toEqual(["J-1"]);
  });

  it("canAddChangeOrder false while draft CO open", () => {
    const draft = {
      id: "J-co",
      customer: "Acme",
      qboCustomerId: "55",
      serviceAddress: "10 Oak St",
      changeOrder: true,
      changeOrderKind: "invoice",
    };
    expect(canAddChangeOrder([BASE, draft], BASE)).toBe(false);
    expect(canAddChangeOrder([BASE], BASE)).toBe(true);
  });
});

describe("briefJobTitleFromDoc", () => {
  it("summarizes first line + amount", () => {
    const t = briefJobTitleFromDoc(
      [{ description: "Add 2 circuits in basement", itemName: "General electrical work", qty: 1, unitPrice: 1200 }],
      1200
    );
    expect(t).toContain("Add 2 circuits");
    expect(t).toContain("$1,200");
  });
});

describe("connectDocsPatch", () => {
  it("links invoice job to estimate at same address", () => {
    const inv = { id: "J-inv", invoiceNo: "251100", serviceAddress: "10 Oak St", customer: "Acme", qboCustomerId: "55" };
    const est = { id: "J-est", estimateNo: "25400", serviceAddress: "10 Oak St", customer: "Acme", qboCustomerId: "55" };
    const patches = connectDocsPatch(inv, [est], { sameJobInfo: true });
    expect(patches["J-inv"].estimateNo).toBe("25400");
    expect(patches["J-est"].jobInfoLeadId).toBe("J-inv");
  });
});