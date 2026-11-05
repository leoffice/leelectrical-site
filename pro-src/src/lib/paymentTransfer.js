// Payment rows for history and a later books transfer.
// Reads ledgers that already exist. Does not create a row from a paid flag
// or from gross minus open balance.
import { normalizePayments, totalPaid } from "./payments.js";
import { parseAmount } from "./format.js";

/**
 * Fill payment arrays on list jobs from view=ledger.
 * A job that already has payments keeps them (overlay wins later, at merge).
 */
export function applyPaymentLedger(jobs, ledgerDoc) {
  if (!ledgerDoc || ledgerDoc.view !== "ledger") return jobs || [];
  const byId = new Map();
  for (const row of ledgerDoc.jobs || []) {
    if (!row || !row.id || !Array.isArray(row.payments) || !row.payments.length) continue;
    byId.set(String(row.id), row.payments);
  }
  if (!byId.size) return jobs || [];
  return (jobs || []).map((j) => {
    if (!j || !j.id) return j;
    if (Array.isArray(j.payments) && j.payments.length) return j;
    const extra = byId.get(String(j.id));
    if (!extra) return j;
    return { ...j, payments: extra };
  });
}

/**
 * One row per payment id. Tombstones and balance-guessed rows stay out.
 * Deleted jobs stay in the list with deletedJob set, so they can be reviewed
 * instead of disappearing.
 */
export function paymentsForTransfer(jobs) {
  const seen = new Set();
  const rows = [];
  for (const j of jobs || []) {
    if (!j) continue;
    for (const p of normalizePayments(j)) {
      if (p._inferred) continue;
      const id = String(p.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push({
        id,
        jobId: String(j.id || ""),
        invoiceNo: j.invoiceNo ? String(j.invoiceNo) : "",
        amount: parseAmount(p.amount),
        date: p.date || "",
        method: p.method || "",
        ref: p.ref || "",
        qboPaymentId: p.qboPaymentId || "",
        source: p.source || "",
        deletedJob: !!j._deleted,
      });
    }
  }
  return rows;
}

/** Sum of real ledger rows. Ignores a paid flag when the ledger is empty. */
export function ledgerPaid(job) {
  return totalPaid(normalizePayments(job));
}
