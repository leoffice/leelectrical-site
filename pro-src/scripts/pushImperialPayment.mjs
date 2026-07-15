// Add the "Imperial payment — unreconciled" ($15,365) to the live Baez project
// as an off-requisition payment, so paid-to-date = $1,591,265 WITHOUT changing
// the certified G702 math ($1,575,900). Idempotent. Backup taken separately.
const DRY = process.argv.includes("--dry-run");
const STATE = "https://leelectrical.us/.netlify/functions/state";

const IMPERIAL = {
  id: "op-imperial-jointcheck",
  label: "Imperial payment — unreconciled",
  amount: 15365,
  date: "2025-07-20",
  reconciled: false,
  note: "GC joint check paid directly to supplier Imperial — part of total paid ($1,591,265) but not a certified G702 draw. Exact amount to be confirmed against the joint check / bank deposits.",
};

const cb = Date.now();
const state = await (await fetch(`${STATE}?cb=${cb}`)).json();
const list = state.ov?._projects?.list || [];
const idx = list.findIndex((p) => p.id === "proj-baez-place" || /baez/i.test(p.name || ""));
if (idx < 0) {
  console.error("Baez project not found");
  process.exit(1);
}
const p = list[idx];
const existing = p.otherPayments || [];
const others = existing.filter((x) => x.id !== IMPERIAL.id);
const updated = { ...p, otherPayments: [...others, IMPERIAL], updatedAt: Date.now() };

const certified = (p.requisitions || [])
  .filter((r) => r.status !== "void")
  .reduce((s, r) => s + (Number(r.amountCertified) || Number(r.currentPaymentDue) || 0), 0);
const paidToDate = Math.round((certified + IMPERIAL.amount) * 100) / 100;
console.log("Certified (G702):", Math.round(certified * 100) / 100);
console.log("Imperial (unreconciled):", IMPERIAL.amount);
console.log("Paid to date ->", paidToDate, paidToDate === 1591265 ? "(= $1,591,265 ✓)" : "(CHECK)");

const newList = list.map((x, i) => (i === idx ? updated : x));
const ov = { ...(state.ov || {}), _projects: { ...(state.ov?._projects || {}), list: newList } };
console.log("Preserved ov keys:", Object.keys(ov).length, "| requisitions untouched:", updated.requisitions?.length);

if (DRY) {
  console.log("\nDRY-RUN — not pushing.");
  process.exit(0);
}
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
console.log("PUSHED ts:", out.ts);
