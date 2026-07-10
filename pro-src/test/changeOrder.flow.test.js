// Change order numbering, carousel visibility, connect docs.
import { describe, expect, it } from "vitest";
import {
  briefJobTitleFromDoc,
  canAddChangeOrder,
  carouselVisibleJobs,
  changeOrderDocLabel,
  changeOrderJobPatch,
  changeOrderReadyForCarousel,
  connectDocsPatch,
  nextChangeOrderSeq,
} from "../src/lib/changeOrder.js";

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