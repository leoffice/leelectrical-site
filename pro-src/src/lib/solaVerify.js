/** Match Sola portal transactions to LE Pro recorded payments (History verify). */
import { functionsBase } from "./functionsBase.js";
import { authHeader } from "./session.js";
import { emailKeyHeader } from "./emailSendAuth.js";
import { parseMoney } from "./payFees.js";
import { normalizePayments } from "./payments.js";

/** Collect every payment ref on jobs (Sola + QBO) for cross-check. */
export function indexJobPaymentRefs(jobs) {
  const byRef = new Map();
  for (const job of jobs || []) {
    for (const p of normalizePayments(job)) {
      const ref = String(p.ref || "").trim();
      if (!ref) continue;
      const list = byRef.get(ref) || [];
      list.push({
        jobId: job.id,
        customer: job.customer || job.businessName || "",
        invoiceNo: job.invoiceNo || "",
        paymentId: p.id || "",
        amount: parseMoney(p.amount),
        method: p.method || "",
        source: p.source || "",
        date: p.date || "",
      });
      byRef.set(ref, list);
    }
  }
  return byRef;
}

/**
 * Attach match status to each Sola txn:
 * - matched: ref found on a job payment
 * - amount_mismatch: ref found but principal ≠ recorded amount
 * - missing_in_app: approved in Sola, not on any job
 * - declined / voided: portal-only status rows
 */
export function verifySolaTransactions(transactions, jobs) {
  const byRef = indexJobPaymentRefs(jobs);
  return (transactions || []).map((t) => {
    const hits = byRef.get(String(t.ref || "").trim()) || [];
    if (t.voided) {
      return { ...t, match: "voided", appPayments: hits };
    }
    if (t.declined || (!t.approved && !hits.length)) {
      return { ...t, match: t.declined ? "declined" : "other", appPayments: hits };
    }
    if (!hits.length) {
      return { ...t, match: "missing_in_app", appPayments: [] };
    }
    const principal = parseMoney(t.principalAmount);
    const mismatch = hits.some(
      (h) => principal > 0 && Math.abs(h.amount - principal) > 0.02
    );
    return {
      ...t,
      match: mismatch ? "amount_mismatch" : "matched",
      appPayments: hits,
    };
  });
}

export function summarizeSolaVerify(rows) {
  const summary = {
    matched: 0,
    missing_in_app: 0,
    amount_mismatch: 0,
    declined: 0,
    voided: 0,
    other: 0,
  };
  for (const r of rows || []) {
    const k = r.match || "other";
    if (summary[k] != null) summary[k] += 1;
    else summary.other += 1;
  }
  return summary;
}

export async function fetchSolaTransactions({ begin, end } = {}) {
  const q = new URLSearchParams();
  q.set("cb", String(Date.now()));
  if (begin) q.set("begin", begin);
  if (end) q.set("end", end);
  const res = await fetch(`${functionsBase()}/sola-transactions?${q}`, {
    cache: "no-store",
    headers: {
      ...(await authHeader()),
      ...emailKeyHeader(),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Sola report HTTP ${res.status}`);
  }
  return data;
}
