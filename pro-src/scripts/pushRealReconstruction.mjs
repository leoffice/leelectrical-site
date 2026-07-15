// REAL per-line requisition reconstruction (supersedes pushRealValueModel.mjs).
//
// The prior model applied a uniform ~0.9946 scale to EVERY line of EVERY req to
// force elr(Req12)=$1,591,265 — which flattened the real per-line percentages
// into a uniform ~99.46% placeholder. This restores the REAL per-line G703
// percentages that already live in baez_requisitions_import.json (parsed from
// the actual Drive continuation sheets by importBaezRequisitions.py):
//   - Reqs 1-11: real, varied per-line %s (Reqs 4 & 5 partly interpolated/PDF).
//   - Req 12:    real 100% base closeout — CONFIRMED by the submitted Req 12
//                G702 (Line 4 total completed $1,751,000; base = $1,700,000 =
//                100%). Not a placeholder; the base contract is fully complete.
//
// The chain is exact: each req's "previous certificates" = the prior req's
// earned-less-retainage (6 = 7 + 8 for all 12). Creating Req 13 defaults every
// line to Req 12's last-submitted % (100%) and previous-certs to $1,591,265.
//
// $1,591,265 is Levi's CONFIRMED paid-to-date. With the REAL SOV values (both
// service lines retainage-exempt: $466,800 + $231,900 = $698,700) and the real
// 100% closeout, the coherent computed elr is $1,599,870 (retainage $100,130).
// $1,591,265 is $8,605 below that (a retainage release / Imperial joint-check
// reconciliation, per the forensics — NOT derivable from any per-line % or SOV
// subset). It is therefore pinned on Req 12 via the code's authoritative-
// certificate mechanism (r.g702.authoritative), NOT faked into line %s.
import { readFileSync } from "fs";
const DRY = process.argv.includes("--dry-run");
const PRO = "/Users/levik/Downloads/leelectrical-repo/pro-src";
const STATE = "https://leelectrical.us/.netlify/functions/state";
const { requisitionItems, sumItemValues, roundMoney, changeOrderItems } = await import(PRO + "/src/lib/requisitionCalc.js");
const { reconcileRequisitionFinancials, buildDraftG702, applyCarriedPercentages } = await import(PRO + "/src/lib/requisitionHelpers.js");
const { ensureProjectDefaults, BAEZ_PROJECT_ID, BAEZ_ADDRESS, JOY_GC_LABEL, joyCustomerKey } = await import(PRO + "/src/lib/requisitionData.js");

const data = JSON.parse(readFileSync(PRO + "/scripts/baez_requisitions_import.json", "utf8"));
const TARGET = 1591265; // Levi-confirmed paid-to-date through Req 12
const key = (it) => `${String(it.section || "").trim().toLowerCase().replace(/\s+/g, " ")}|${String(it.description || "").trim().toLowerCase().replace(/\s+/g, " ")}`;

// SOV line values come straight from the Drive continuation sheets (e.g. item 1 = $459,000).
const items = data.masterItems.map((it) => ({
  ...it,
  retainageExempt: it.id === "item-1" || it.id === "item-2",
}));
const coTotal = sumItemValues(changeOrderItems(items));
const baseContract = sumItemValues(items) - coTotal;

const project = {
  id: BAEZ_PROJECT_ID, name: "Baez Place", address: BAEZ_ADDRESS, contractor: "Martin Dorkin", gc: JOY_GC_LABEL,
  customerKey: joyCustomerKey(), contractSum: baseContract, retainagePct: 10, changeOrders: coTotal, changeOrderList: [],
  items, requisitions: [], requisitionEnabled: true,
  driveLinks: [{ label: "Baez Requisitions folder", url: "https://drive.google.com/drive/folders/1u7dvjlppZD5DUFJURAzqeMD_c5kNCEOs", addedAt: Date.now() }],
  jobId: "", createdAt: Date.now() - 86400000 * 400, updatedAt: Date.now(),
};

let base = Date.parse("2016-02-25T12:00:00Z");
for (const meta of data.requisitions) {
  const sm = Object.fromEntries((meta.itemsSnapshot || []).map((s) => [s.key, s.completedPct]));
  // REAL per-line % straight from the parsed G703 — no scale, no fine-tune.
  const snap = items.map((it) => ({
    id: it.id, key: key(it), section: it.section, description: it.description,
    completedPct: Math.min(100, sm[key(it)] ?? 0),
  }));
  const rec = {
    id: `req-baez-${meta.num}`, num: meta.num, status: "submitted", applicationNumber: meta.applicationNumber,
    periodTo: meta.periodTo, submittedAt: base, createdAt: base, itemsSnapshot: snap, payments: [],
    attachments: (meta.attachments || []).map((a, i) => ({
      id: `att-req${meta.num}-${i}`, name: a.name, url: a.webViewLink || `file://${a.localPath}`,
      mime: "application/pdf", attachToEmail: /requisition|req/i.test(a.name), addedAt: base,
    })),
  };
  // Pin the CONFIRMED paid-to-date onto the final requisition (real submitted
  // certificate). totalCompleted = full base SOV (real 100% closeout).
  if (meta.num === 12) {
    rec.g702 = {
      authoritative: true,
      source: "Levi-confirmed paid-to-date thru Req 12 (submitted G702 + retainage release)",
      earnedLessRetainage: TARGET,
      totalCompleted: 1700000,
    };
  }
  project.requisitions.push(rec);
  base += 86400000 * 60;
}

const rec = ensureProjectDefaults(reconcileRequisitionFinancials(project));

// ---- verification ----
const r12 = rec.requisitions.find((r) => r.num === 12);
const baseItems = requisitionItems(rec.items);
const withCarried = applyCarriedPercentages(rec);
const g13 = buildDraftG702(withCarried, { periodTo: "2025-09-01" });

let chain = true, pe = 0;
for (const r of rec.requisitions) {
  if (Math.abs((r.previousCertificates || 0) - pe) > 0.02) chain = false;
  if (Math.abs((r.earnedLessRetainage || 0) - ((r.previousCertificates || 0) + (r.currentPaymentDue || 0))) > 0.02) chain = false;
  pe = r.earnedLessRetainage || 0;
}
const distinctByReq = rec.requisitions.map((r) => new Set(r.itemsSnapshot.map((s) => s.completedPct)).size);

console.log("=== REAL per-line reconstruction ===");
console.log("SOV base total:", sumItemValues(baseItems), "| exempt:", baseItems.filter((i) => i.retainageExempt).map((i) => `${i.id}=${i.value}`).join(","));
console.log("distinct %s per req (1..12):", distinctByReq.join(","), "  <- reqs 1-11 varied, req12=1 (real 100% closeout)");
console.log("elr(Req12):", r12.earnedLessRetainage, r12.earnedLessRetainage === TARGET ? "= $1,591,265 ✓" : `(off ${r12.earnedLessRetainage - TARGET})`);
console.log("Req12 completed", r12.totalCompleted, "| G702 retainage", r12.totalRetainage, "| G703 line-sum retainage", roundMoney(r12.g703.reduce((s, row) => s + (row.retainage || 0), 0)), "| residual (release)", roundMoney(r12.totalRetainage - r12.g703.reduce((s, row) => s + (row.retainage || 0), 0)));
console.log("chain intact (6=7+8, prevCert=prior elr):", chain ? "YES" : "NO");
console.log("Req13 default previous certificates:", g13.previousCertificates, g13.previousCertificates === TARGET ? "= $1,591,265 ✓" : "");
console.log("Req13 default per-line %s = Req12 submitted:", baseItems.slice(0, 3).map((it) => `${it.description.slice(0, 16)}=${it.completedPct}%`).join(" | "));

if (DRY) { console.log("\nDRY-RUN — not pushing"); process.exit(0); }

const cb = Date.now();
const st = await (await fetch(`${STATE}?cb=${cb}`)).json();
const list = st.ov?._projects?.list || [];
const idx = list.findIndex((p) => p.id === BAEZ_PROJECT_ID || /baez/i.test(p.name || ""));
const newList = idx >= 0 ? list.map((p, i) => (i === idx ? rec : p)) : [...list, rec];
const ov = { ...(st.ov || {}), _projects: { ...(st.ov?._projects || {}), list: newList } };
const res = await fetch(`${STATE}?cb=${cb}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ov }) });
const out = await res.json();
if (!res.ok) { console.error("PUSH FAILED", out); process.exit(1); }
console.log("\nPUSHED ts:", out.ts, "| preserved ov keys:", Object.keys(ov).length, "| projects:", newList.length);
