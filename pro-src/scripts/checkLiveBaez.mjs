import { readFileSync } from "fs";
import { buildDraftG702, applyCarriedPercentages, reconcileRequisitionFinancials } from "../src/lib/requisitionHelpers.js";

const url = process.argv[2] || `https://leelectrical.us/.netlify/functions/state?cb=${Date.now()}`;
const st = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], "utf8"))
  : await (await fetch(url)).json();
const list = st.ov?._projects?.list || [];
const p = list.find((x) => /baez/i.test(x.name || "") || x.id === "proj-baez-place");
if (!p) {
  console.log("no baez");
  process.exit(0);
}
const reqs = [...(p.requisitions || [])].sort((a, b) => (b.num || 0) - (a.num || 0));
console.log("req count", reqs.length);
for (const r of reqs.slice(0, 4)) {
  console.log("REQ", r.num, "elr", r.earnedLessRetainage, "prev", r.previousCertificates, "due", r.currentPaymentDue);
  if (r.g702) console.log("  g702", JSON.stringify(r.g702));
}
const rec = reconcileRequisitionFinancials(p);
const g = buildDraftG702(applyCarriedPercentages(rec));
console.log("draft computed prev", g.computedPreviousCertificates, "prev", g.previousCertificates, "due", g.currentPaymentDue, "elr", g.earnedLessRetainage);