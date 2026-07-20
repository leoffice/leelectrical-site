// End-to-end takeoff flow against the REAL demo fetch interceptor (no network).
// Proves the acceptance path: attach → process → adjust a quantity → submit →
// the quantities land on the requisition SOV → the correction diff is logged.
// The same adapter + demo backend the deployed demo tenant runs are used here,
// so a green run is a faithful stand-in for the click-through the file-upload
// dialog makes hard to automate.
import { describe, it, expect, beforeAll } from "vitest";
import { installDemoBackend } from "../src/demo/demoBackend.js";
import { createNetlifyAdapter } from "../src/data/netlifyAdapter.js";
import {
  normalizeWorkerOutput,
  takeoffItemsToSovItems,
  correctionDiff,
} from "../src/lib/takeoffModel.js";
import { buildTakeoffXlsx, buildTakeoffCsv } from "../src/lib/takeoffExport.js";
import { findProject, ensureProjectDefaults, upsertProject, normalizeProjects } from "../src/lib/requisitionData.js";

let leaked;
beforeAll(() => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  };
  leaked = false;
  const realFetch = async () => {
    leaked = true;
    return new Response("{}", { status: 200 });
  };
  globalThis.fetch = realFetch;
  installDemoBackend();
});

describe("takeoff demo e2e", () => {
  it("attach → process → adjust → submit → lands on SOV → diff logged", async () => {
    const api = createNetlifyAdapter();
    const PROJECT = "demo-project-1";

    // Baseline SOV size on the seeded requisition project.
    const before = normalizeProjects(await api.getProjects());
    const baseItems = ensureProjectDefaults(findProject(before, PROJECT)).items.length;
    expect(baseItems).toBeGreaterThan(0);

    // 1. Process two "attached" blueprints (bytes irrelevant to the demo engine).
    const res = await api.processTakeoff({
      projectId: PROJECT,
      files: [
        { name: "E-101-power.pdf", mime: "application/pdf", b64: "" },
        { name: "E-201-lighting.pdf", mime: "application/pdf", b64: "" },
      ],
    });
    expect(res.documents.length).toBe(2);
    const norm = normalizeWorkerOutput(res.documents);
    expect(norm.items.length).toBeGreaterThan(3);
    const skillItems = norm.items.map((i) => ({ ...i }));

    // 2. Human adjusts: bump the first line's qty, price two lines, add a manual row.
    const human = norm.items.map((i) => ({ ...i }));
    const bumpedClass = human[0].symbolClass;
    const skillQty = human[0].qty;
    human[0] = { ...human[0], qty: skillQty + 10, unitPrice: 12 };
    human[1] = { ...human[1], unitPrice: 8 };
    human.push({ symbol: "FA", symbolClass: "FA", description: "Fire alarm pull", qty: 3, unit: "EA", unitPrice: 40, manual: true });

    // 3. Exports produce real artifacts.
    const xlsx = buildTakeoffXlsx(human, { title: "Takeoff" });
    const xbuf = new Uint8Array(await xlsx.arrayBuffer());
    expect(xbuf[0]).toBe(0x50); // PK zip
    expect(buildTakeoffCsv(human, {})).toContain("TOTAL");

    // 4. Submit → append SOV lines to the project.
    const raw = normalizeProjects(await api.getProjects());
    const proj = ensureProjectDefaults(findProject(raw, PROJECT));
    const sov = takeoffItemsToSovItems(human, { idPrefix: "tkE2E" });
    const patched = ensureProjectDefaults({ ...proj, items: [...proj.items, ...sov], requisitionEnabled: true });
    await api.saveProjects(upsertProject(raw, patched));

    // 5. It landed: re-read the project, the SOV grew by the number of takeoff lines.
    const after = normalizeProjects(await api.getProjects());
    const afterItems = ensureProjectDefaults(findProject(after, PROJECT)).items;
    expect(afterItems.length).toBe(baseItems + sov.length);
    const manualLine = afterItems.find((it) => /FA —/.test(it.description));
    expect(manualLine).toBeTruthy();
    expect(manualLine.value).toBe(120); // 3 × 40

    // 6. Correction diff logged to the feedback store.
    const diff = correctionDiff(skillItems, human);
    await api.appendTakeoffFeedback({ projectId: PROJECT, engine: norm.engine, diff, itemCount: human.length });
    const log = await api.getTakeoffFeedback();
    expect(log.length).toBe(1);
    expect(log[0].diff.perClass.find((p) => p.symbolClass === bumpedClass).delta).toBe(10);
    expect(log[0].diff.perClass.find((p) => p.symbolClass === "FA").addedByHuman).toBe(true);

    // Isolation held throughout.
    expect(leaked).toBe(false);
  });
});
