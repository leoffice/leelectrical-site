// Takeoff MVP — unit coverage for the pure model, the extraction heuristic, the
// exporters, and the module route gate. No network, no PDF parser.
import { describe, expect, it } from "vitest";
import {
  normalizeWorkerOutput,
  correctionDiff,
  takeoffItemsToSovItems,
  totalQty,
  totalValue,
  blankManualItem,
} from "../src/lib/takeoffModel.js";
import { buildTakeoffCsv, buildTakeoffXlsx, takeoffToMatrix } from "../src/lib/takeoffExport.js";
import { extractFromWords, classifyTag } from "../../netlify/functions/lib/takeoffExtract.mjs";
import { resolveTenantConfig, isModuleEnabled, LE_TENANT_SEED } from "../src/lib/tenantConfig.js";
import { isRouteAllowed } from "../src/lib/tenantNav.js";

const WORKER_OUTPUT = {
  engine: "js-heuristic-v0",
  worker_id: "w1",
  assignment: { source_sha256: "abc", sheet_ids: [1, 2] },
  candidates: [
    { sheet_id: 1, symbol_class: "WP", method: "vector", score: 0.5, status: "candidate", confidence: "inferred", nearest_text: "WP" },
    { sheet_id: 1, symbol_class: "WP", method: "vector", score: 0.5, status: "candidate", confidence: "inferred", nearest_text: "WP" },
    { sheet_id: 1, symbol_class: "GFI", method: "vector", score: 0.5, status: "candidate", confidence: "supported", nearest_text: "GFI" },
  ],
  summary: { counts: { WP: 2, GFI: 1 }, anomalies: [], notes: "text-tag counts" },
};

describe("normalizeWorkerOutput", () => {
  it("folds counts into editable line items", () => {
    const norm = normalizeWorkerOutput(WORKER_OUTPUT);
    expect(norm.items).toHaveLength(2);
    const wp = norm.items.find((i) => i.symbolClass === "WP");
    expect(wp.qty).toBe(2);
    expect(wp.confidence).toBe("inferred");
    expect(norm.engine).toBe("js-heuristic-v0");
  });

  it("sums counts across multiple documents (multi-file)", () => {
    const doc2 = { ...WORKER_OUTPUT, summary: { counts: { WP: 3 }, anomalies: [], notes: "" }, candidates: [] };
    const norm = normalizeWorkerOutput([WORKER_OUTPUT, doc2]);
    const wp = norm.items.find((i) => i.symbolClass === "WP");
    expect(wp.qty).toBe(5);
  });
});

describe("correctionDiff (calibration signal)", () => {
  it("captures per-class deltas, added + removed rows", () => {
    const skill = normalizeWorkerOutput(WORKER_OUTPUT).items;
    // Human bumps WP 2→4, deletes GFI, adds a manual EM row.
    const human = [
      { ...skill.find((i) => i.symbolClass === "WP"), qty: 4 },
      { symbolClass: "EM", symbol: "EM", qty: 6, manual: true },
    ];
    const diff = correctionDiff(skill, human);
    const wp = diff.perClass.find((p) => p.symbolClass === "WP");
    expect(wp.delta).toBe(2);
    expect(wp.correctionFactor).toBe(2);
    const gfi = diff.perClass.find((p) => p.symbolClass === "GFI");
    expect(gfi.removedByHuman).toBe(true);
    const em = diff.perClass.find((p) => p.symbolClass === "EM");
    expect(em.addedByHuman).toBe(true);
    expect(diff.changedCount).toBe(3);
    expect(diff.totalHumanQty).toBe(10);
  });
});

describe("takeoffItemsToSovItems (feed the requisition)", () => {
  it("maps priced items to SOV lines and drops zero-qty rows", () => {
    const items = [
      { symbol: "WP", description: "Weatherproof recept", qty: 4, unit: "EA", unitPrice: 25 },
      { symbol: "X", description: "zero", qty: 0, unit: "EA", unitPrice: 5 },
    ];
    const sov = takeoffItemsToSovItems(items, { idPrefix: "tk1" });
    expect(sov).toHaveLength(1);
    expect(sov[0].value).toBe(100);
    expect(sov[0].description).toContain("WP");
    expect(sov[0].description).toContain("(4 EA)");
    expect(sov[0]).toHaveProperty("completedPct", 0);
    expect(sov[0]).toHaveProperty("contractPct", 100);
  });
});

describe("extractFromWords (vector-text heuristic)", () => {
  it("counts known device tags and switch/receptacle callouts", () => {
    const words = ["ROOM", "101", "WP", "WP", "GFI", "S3", "S3", "S3", "TYP", "the", "PLAN"];
    const doc = extractFromWords(words, { source_sha256: "z" });
    expect(doc.summary.counts.WP).toBe(2);
    expect(doc.summary.counts.S3).toBe(3);
    expect(doc.summary.counts.GFI).toBe(1);
    // Stopwords are not counted.
    expect(doc.summary.counts.TYP).toBeUndefined();
    expect(doc.summary.counts.PLAN).toBeUndefined();
    expect(doc.candidates.every((c) => c.confidence === "inferred")).toBe(true);
  });

  it("returns an honest empty doc with anomaly when nothing matches", () => {
    const doc = extractFromWords(["lorem", "ipsum", "dolor"], {});
    expect(Object.keys(doc.summary.counts)).toHaveLength(0);
    expect(doc.summary.anomalies).toContain("no-tags-found");
  });

  it("classifyTag ignores compass letters + stopwords", () => {
    expect(classifyTag("WP")).toBe("WP");
    expect(classifyTag("S3")).toBe("S3");
    expect(classifyTag("NTS")).toBeNull();
    expect(classifyTag("GENERAL")).toBeNull();
  });
});

describe("exporters", () => {
  const items = normalizeWorkerOutput(WORKER_OUTPUT).items.map((i) => ({ ...i, unitPrice: 10 }));

  it("CSV has a header, rows, and a TOTAL line", () => {
    const csv = buildTakeoffCsv(items, { title: "T" });
    expect(csv).toContain("Symbol,Class,Description");
    expect(csv).toContain("WP");
    expect(csv).toContain("TOTAL");
  });

  it("matrix totals reconcile to the model totals", () => {
    const m = takeoffToMatrix(items);
    const totalRow = m[m.length - 1];
    expect(totalRow[3]).toBe(totalQty(items)); // qty col
    expect(totalRow[6]).toBe(Math.round(totalValue(items) * 100) / 100); // amount col
  });

  it("xlsx is a non-empty PK-zip blob", async () => {
    const blob = buildTakeoffXlsx(items, { title: "T" });
    expect(blob.type).toContain("spreadsheetml");
    const buf = new Uint8Array(await blob.arrayBuffer());
    // ZIP local-file-header magic "PK\x03\x04".
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    expect(buf.length).toBeGreaterThan(200);
  });
});

describe("blankManualItem", () => {
  it("is manual + editable with sane defaults", () => {
    const m = blankManualItem(0);
    expect(m.manual).toBe(true);
    expect(m.qty).toBe(1);
    expect(m.unit).toBe("EA");
  });
});

describe("takeoff module gating", () => {
  it("LE (internal) and full tier get takeoff; pro/free do not", () => {
    const le = resolveTenantConfig(LE_TENANT_SEED);
    expect(isModuleEnabled(le, "takeoff")).toBe(true);

    const full = resolveTenantConfig({ tenantId: "t", plan: { tier: "full" } });
    expect(isModuleEnabled(full, "takeoff")).toBe(true);

    const pro = resolveTenantConfig({ tenantId: "t", plan: { tier: "pro" } });
    expect(isModuleEnabled(pro, "takeoff")).toBe(false);
  });

  it("the /takeoff route is registered only when the module is on", () => {
    const full = resolveTenantConfig({ tenantId: "t", plan: { tier: "full" } });
    const pro = resolveTenantConfig({ tenantId: "t", plan: { tier: "pro" } });
    expect(isRouteAllowed("/takeoff", full)).toBe(true);
    expect(isRouteAllowed("/takeoff/:projectId", full)).toBe(true);
    expect(isRouteAllowed("/takeoff", pro)).toBe(false);
  });
});
