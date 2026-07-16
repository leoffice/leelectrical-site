// REAL per-line requisition reconstruction.
//
// Levi (2026-07-16) corrections vs prior model:
//   1. Contract sum is $1,700,000 only. The ~$30k CO lines (hours extras) do
//      NOT belong on progress requisitions — set changeOrders=0 and exclude
//      CO SOV lines from G703 (requisitionItems already filters them).
//   2. ONLY the first SOV line (Electric Service Equipment, $459,000) is
//      retainage-exempt. Item 2 (Installation) takes the normal 10%.
//      At 100% closeout: retainable base = $1,241,000 → retainage $124,100.
//   3. Chain is pure SOV math — no authoritative paid-to-date pin.
//      Req 11 ELR = Req 12 previous certificates = $1,467,621.90
//      Req 12 ELR = $1,575,900 · due = $108,278.10 · total completed $1,700,000
//
// Per-line %s come from baez_requisitions_import.json (Drive continuation
// sheets parsed by importBaezRequisitions.py).
import { readFileSync } from "fs";
const DRY = process.argv.includes("--dry-run");
const PRO = "/Users/levik/Downloads/leelectrical-repo/pro-src";
const STATE = "https://leelectrical.us/.netlify/functions/state";
const { requisitionItems, sumItemValues, roundMoney, changeOrderItems } = await import(PRO + "/src/lib/requisitionCalc.js");
const { reconcileRequisitionFinancials, buildDraftG702, applyCarriedPercentages } = await import(PRO + "/src/lib/requisitionHelpers.js");
const { ensureProjectDefaults, BAEZ_PROJECT_ID, BAEZ_ADDRESS, JOY_GC_LABEL, joyCustomerKey } = await import(PRO + "/src/lib/requisitionData.js");

const data = JSON.parse(readFileSync(PRO + "/scripts/baez_requisitions_import.json", "utf8"));
const key = (it) =>
  `${String(it.section || "").trim().toLowerCase().replace(/\s+/g, " ")}|${String(it.description || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;

// Keep CO lines on the project SOV for reference, but they never bill on a progress
// requisition (changeOrders: 0 + requisitionItems filter). Only item-1 is exempt.
const items = data.masterItems.map((it) => ({
  ...it,
  retainageExempt: it.id === "item-1",
}));
const coLines = changeOrderItems(items);
const baseContract = 1700000; // Levi-confirmed; base SOV lines sum to this

const project = {
  id: BAEZ_PROJECT_ID,
  name: "Baez Place",
  address: BAEZ_ADDRESS,
  contractor: "Martin Dorkin",
  gc: JOY_GC_LABEL,
  customerKey: joyCustomerKey(),
  contractSum: baseContract,
  retainagePct: 10,
  changeOrders: 0, // COs not included on progress requisitions
  changeOrderList: coLines.map((it) => ({
    id: it.id,
    description: it.description,
    value: it.value,
    section: it.section,
  })),
  items,
  requisitions: [],
  requisitionEnabled: true,
  driveLinks: [
    {
      label: "Baez Requisitions folder",
      url: "https://drive.google.com/drive/folders/1u7dvjlppZD5DUFJURAzqeMD_c5kNCEOs",
      addedAt: Date.now(),
    },
  ],
  jobId: "",
  createdAt: Date.now() - 86400000 * 400,
  updatedAt: Date.now(),
};

let base = Date.parse("2016-02-25T12:00:00Z");
for (const meta of data.requisitions) {
  const sm = Object.fromEntries((meta.itemsSnapshot || []).map((s) => [s.key, s.completedPct]));
  // Snapshot only base-contract lines (no COs on the requisition).
  const snap = requisitionItems(items).map((it) => ({
    id: it.id,
    key: key(it),
    section: it.section,
    description: it.description,
    completedPct: Math.min(100, sm[key(it)] ?? 0),
  }));
  const rec = {
    id: `req-baez-${meta.num}`,
    num: meta.num,
    status: "submitted",
    applicationNumber: meta.applicationNumber,
    periodTo: meta.periodTo,
    submittedAt: base,
    createdAt: base,
    itemsSnapshot: snap,
    payments: [],
    attachments: (meta.attachments || []).map((a, i) => ({
      id: `att-req${meta.num}-${i}`,
      name: a.name,
      url: a.webViewLink || `file://${a.localPath}`,
      mime: "application/pdf",
      attachToEmail: /requisition|req/i.test(a.name),
      addedAt: base,
    })),
  };
  project.requisitions.push(rec);
  base += 86400000 * 60;
}

const rec = ensureProjectDefaults(reconcileRequisitionFinancials(project));

// ---- verification ----
const r11 = rec.requisitions.find((r) => r.num === 11);
const r12 = rec.requisitions.find((r) => r.num === 12);
const baseItems = requisitionItems(rec.items);
const withCarried = applyCarriedPercentages(rec);
const g13 = buildDraftG702(withCarried, { periodTo: "2025-09-01" });

const TARGET_PREV = 1467621.9;
const TARGET_RET = 124100;
const TARGET_ELR12 = 1575900;
const TARGET_DUE12 = 108278.1;

let chain = true,
  pe = 0;
for (const r of rec.requisitions) {
  if (Math.abs((r.previousCertificates || 0) - pe) > 0.02) chain = false;
  if (Math.abs((r.earnedLessRetainage || 0) - ((r.previousCertificates || 0) + (r.currentPaymentDue || 0))) > 0.02)
    chain = false;
  pe = r.earnedLessRetainage || 0;
}
const distinctByReq = rec.requisitions.map((r) => new Set(r.itemsSnapshot.map((s) => s.completedPct)).size);
const lineRet12 = roundMoney((r12.g703 || []).reduce((s, row) => s + (row.retainage || 0), 0));

console.log("=== REAL reconstruction (item-1 exempt, no COs on reqs) ===");
console.log(
  "SOV base total:",
  sumItemValues(baseItems),
  "| exempt:",
  baseItems.filter((i) => i.retainageExempt).map((i) => `${i.id}=${i.value}`).join(",") || "(none)"
);
console.log("changeOrders on project:", rec.changeOrders, "| CO lines kept for ref:", coLines.length);
console.log("distinct %s per req (1..12):", distinctByReq.join(","));
for (const r of rec.requisitions) {
  console.log(
    `  REQ ${String(r.num).padStart(2)}: tc=${r.totalCompleted} ret=${r.totalRetainage} elr=${r.earnedLessRetainage} prev=${r.previousCertificates} due=${r.currentPaymentDue}`
  );
}
console.log(
  "Req11 elr:",
  r11.earnedLessRetainage,
  r11.earnedLessRetainage === TARGET_PREV ? `= $${TARGET_PREV} ✓` : `(off ${r11.earnedLessRetainage - TARGET_PREV})`
);
console.log(
  "Req12 prev:",
  r12.previousCertificates,
  r12.previousCertificates === TARGET_PREV ? `= $${TARGET_PREV} ✓` : `(off ${r12.previousCertificates - TARGET_PREV})`
);
console.log(
  "Req12 ret:",
  r12.totalRetainage,
  "line-sum:",
  lineRet12,
  r12.totalRetainage === TARGET_RET && lineRet12 === TARGET_RET ? "= $124,100 ✓" : ""
);
console.log(
  "Req12 elr/due:",
  r12.earnedLessRetainage,
  r12.currentPaymentDue,
  r12.earnedLessRetainage === TARGET_ELR12 && r12.currentPaymentDue === TARGET_DUE12 ? "✓" : ""
);
console.log("chain intact (6=7+8, prevCert=prior elr):", chain ? "YES" : "NO");
console.log("Req13 default previous certificates:", g13.previousCertificates);
console.log("item1 ret%:", r12.g703[0]?.retainagePct, "ret$:", r12.g703[0]?.retainage);
console.log("item2 ret%:", r12.g703[1]?.retainagePct, "ret$:", r12.g703[1]?.retainage);

const ok =
  chain &&
  r11.earnedLessRetainage === TARGET_PREV &&
  r12.previousCertificates === TARGET_PREV &&
  r12.totalRetainage === TARGET_RET &&
  lineRet12 === TARGET_RET &&
  r12.earnedLessRetainage === TARGET_ELR12 &&
  r12.currentPaymentDue === TARGET_DUE12;

if (!ok) {
  console.error("\nVERIFICATION FAILED — not pushing");
  process.exit(1);
}

if (DRY) {
  console.log("\nDRY-RUN — not pushing");
  process.exit(0);
}

const cb = Date.now();
const st = await (await fetch(`${STATE}?cb=${cb}`)).json();
const list = st.ov?._projects?.list || [];
const idx = list.findIndex((p) => p.id === BAEZ_PROJECT_ID || /baez/i.test(p.name || ""));
const newList = idx >= 0 ? list.map((p, i) => (i === idx ? rec : p)) : [...list, rec];
const ov = { ...(st.ov || {}), _projects: { ...(st.ov?._projects || {}), list: newList } };
const res = await fetch(`${STATE}?cb=${cb}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ov }),
});
const out = await res.json();
if (!res.ok) {
  console.error("PUSH FAILED", out);
  process.exit(1);
}
console.log("\nPUSHED ts:", out.ts, "| preserved ov keys:", Object.keys(ov).length, "| projects:", newList.length);
