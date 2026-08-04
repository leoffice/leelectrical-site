// Apply QuickBooks payment fetch results to a job overlay.
// Local paid status is authoritative — QBO is an additional backend step.
// Never un-pay a job because QuickBooks is still catching up.
import { parseAmount, todayStr } from "./format.js";
import {
  amountOwedAtStart,
  applyPaymentsPatch,
  normalizePaymentMethod,
  normalizePayments,
  parseBalanceFromNotes,
  remainingBalance,
  totalPaid,
} from "./payments.js";

function refFromNote(note, fallback) {
  const m = String(note || "").match(/\bref\s+([A-Za-z0-9_-]+)/i);
  return m ? m[1] : fallback || "";
}

function mapFetchedPayment(p) {
  const amt = parseAmount(p.amount);
  if (amt <= 0) return null;
  const whole = amt % 1 === 0;
  const note = p.note || p.privateNote || "";
  const ref = refFromNote(note, p.ref) || p.ref || "";
  return {
    id: p.id || "qbo-" + (p.qboPaymentId || ref || amt),
    amount: whole ? "$" + Math.round(amt) : "$" + amt.toFixed(2),
    method: normalizePaymentMethod(p.method, { note, ref }),
    ref,
    date: p.date || todayStr(),
    source: p.source || "qbo",
    qboPaymentId: p.qboPaymentId || (String(p.id || "").startsWith("qbo-") ? String(p.id).slice(4) : ""),
    syncToken: p.syncToken != null ? String(p.syncToken) : "",
    note,
  };
}

function parseFetchResult(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/** Amounts match within a cent. */
function amountsClose(a, b) {
  return Math.abs(parseAmount(a?.amount) - parseAmount(b?.amount)) <= 0.01;
}

function datesCompatible(a, b) {
  return !a?.date || !b?.date || String(a.date).slice(0, 10) === String(b.date).slice(0, 10);
}

/**
 * Match strength for 1:1 pairing (higher = more confident).
 * 3 = qboPaymentId · 2 = row id · 1 = amount + non-empty matching ref
 * 0 = weak amount+date only (enrichment 1:1 — NEVER used to drop extras)
 * null = no match
 *
 * P0 (Seewald): blank date/ref must NOT amount-match every identical $5k row.
 * samePaymentRow used to treat missing ref/date as "same" → all local $5k rows
 * matched some QBO row → keepLocal emptied → 4th payment deleted.
 */
export function paymentMatchStrength(a, b) {
  if (!a || !b) return null;
  const aq = String(a.qboPaymentId || "").trim();
  const bq = String(b.qboPaymentId || "").trim();
  if (aq && bq && aq === bq) return 3;
  if (a.id && b.id && String(a.id) === String(b.id)) return 2;
  if (!amountsClose(a, b)) return null;
  const ar = String(a.ref || "").trim().toLowerCase();
  const br = String(b.ref || "").trim().toLowerCase();
  if (ar && br && ar === br) return 1;
  // Conflicting non-empty refs → never the same payment.
  if (ar && br && ar !== br) return null;
  // Weak amount-only: used ONLY for 1:1 occurrence pairing (enrich / avoid
  // double-count). Never treats all N local $5k as "matched" by M < N QBO rows.
  // Prefer same-date pairs when ranking (caller may use datesCompatible).
  return 0;
}

/** @deprecated Prefer paymentMatchStrength + occurrence-counted merge. */
export function samePaymentRow(a, b) {
  const s = paymentMatchStrength(a, b);
  // Strong identity only — amount-only (0) is NOT "same row" for deletion.
  return s != null && s >= 1;
}

function enrichLocalWithQbo(local, qbo) {
  const out = { ...local };
  if (qbo.qboPaymentId) out.qboPaymentId = qbo.qboPaymentId;
  if (qbo.syncToken != null && qbo.syncToken !== "") out.syncToken = String(qbo.syncToken);
  if (qbo.method && !out.method) out.method = qbo.method;
  if (qbo.note && !out.note) out.note = qbo.note;
  if (qbo.ref && !String(out.ref || "").trim()) out.ref = qbo.ref;
  if (qbo.date && !out.date) out.date = qbo.date;
  if (!out.source || out.source === "lepro") out.source = out.qboPaymentId ? "qbo" : out.source || "lepro";
  // Confident QBO link — clear any prior "not in QBO" flag.
  if (out.notInQbo) delete out.notInQbo;
  if (out.syncFlag === "not_in_qbo") delete out.syncFlag;
  return out;
}

function flagNotInQbo(p) {
  return { ...p, notInQbo: true, syncFlag: "not_in_qbo" };
}

/**
 * Non-destructive union of local ledger + QBO fetch.
 *
 * LE Pro is source of truth for the payments array: never drop a local row
 * just because QBO returned fewer (or zero) matches. Pair 1:1 by stable id /
 * ref / occurrence-counted amount so N local identical $5k rows are never
 * consumed by fewer than N QBO rows. Unmatched locals are retained and
 * flagged "not in QBO". Unmatched QBO rows are appended.
 */
export function mergeLocalAndQboPayments(job, qboPayments) {
  const qbo = (qboPayments || []).filter(Boolean);
  const local = normalizePayments(job);
  if (!local.length) return qbo.map((p) => ({ ...p }));
  if (!qbo.length) return local.map(flagNotInQbo);

  const usedQbo = new Set();
  const usedLocal = new Set();
  const result = [];

  // Pass 1 — strong identity (qboPaymentId / id / amount+ref), best match first.
  for (let li = 0; li < local.length; li++) {
    let bestQi = -1;
    let bestS = -1;
    for (let qi = 0; qi < qbo.length; qi++) {
      if (usedQbo.has(qi)) continue;
      const s = paymentMatchStrength(local[li], qbo[qi]);
      if (s != null && s >= 1 && s > bestS) {
        bestS = s;
        bestQi = qi;
      }
    }
    if (bestQi >= 0) {
      usedQbo.add(bestQi);
      usedLocal.add(li);
      result.push(enrichLocalWithQbo(local[li], qbo[bestQi]));
    }
  }

  // Pass 2a — weak amount + same calendar date, 1:1 (best signal without id/ref).
  for (let li = 0; li < local.length; li++) {
    if (usedLocal.has(li)) continue;
    for (let qi = 0; qi < qbo.length; qi++) {
      if (usedQbo.has(qi)) continue;
      if (paymentMatchStrength(local[li], qbo[qi]) !== 0) continue;
      if (!(local[li].date && qbo[qi].date)) continue;
      if (!datesCompatible(local[li], qbo[qi])) continue;
      usedQbo.add(qi);
      usedLocal.add(li);
      result.push(enrichLocalWithQbo(local[li], qbo[qi]));
      break;
    }
  }

  // Pass 2b — remaining weak amount-only 1:1 (occurrence count; never all-to-all).
  for (let li = 0; li < local.length; li++) {
    if (usedLocal.has(li)) continue;
    for (let qi = 0; qi < qbo.length; qi++) {
      if (usedQbo.has(qi)) continue;
      if (paymentMatchStrength(local[li], qbo[qi]) !== 0) continue;
      usedQbo.add(qi);
      usedLocal.add(li);
      result.push(enrichLocalWithQbo(local[li], qbo[qi]));
      break;
    }
  }

  // Pass 3 — remaining local: KEEP + flag not in QBO (never hard-delete).
  for (let li = 0; li < local.length; li++) {
    if (usedLocal.has(li)) continue;
    result.push(flagNotInQbo(local[li]));
  }

  // Pass 4 — remaining QBO rows not already represented locally.
  for (let qi = 0; qi < qbo.length; qi++) {
    if (usedQbo.has(qi)) continue;
    result.push({ ...qbo[qi] });
  }

  return result;
}

/** Turn fetch_payments command JSON into a patchJob overlay. */
export function patchFromQboPaymentFetch(job, fetchRaw) {
  const fetch = parseFetchResult(fetchRaw);
  if (!fetch?.payments) return null;

  const qboPayments = fetch.payments.map(mapFetchedPayment).filter(Boolean);
  // Keep app-recorded payments that QBO has not absorbed yet.
  const payments = mergeLocalAndQboPayments(job, qboPayments);

  const baseline =
    parseAmount(job?.amount) ||
    parseAmount(fetch.invoiceTotal) ||
    parseAmount(job?.paymentBaseline) ||
    0;
  const qboBalance = fetch.openBalance != null ? parseAmount(fetch.openBalance) : null;
  const merged = { ...job, payments, paymentBaseline: baseline };
  const patch = applyPaymentsPatch(merged, payments);

  // Local ledger fully covers the invoice → paid is already true from applyPaymentsPatch.
  // QBO confirmation is optional/additional — never un-pay while backend is still syncing.
  const localRemaining = remainingBalance({ ...job, paymentBaseline: baseline, payments }, payments);
  const localSaysPaid = localRemaining <= 0.01 || !!job?.paid || !!patch.paid;

  if (qboBalance != null && qboBalance >= 0) {
    if (qboBalance <= 0.01) {
      // QBO says fully paid — trust that (may have payments we don't list yet).
      patch.openBalance = 0;
      patch.paid = true;
      if (!patch.status?.Paid?.s) {
        const d =
          payments[0]?.date ||
          job?.payment?.date ||
          todayStr();
        patch.status = { Paid: { s: "done", d }, "Follow-up": { s: "done", d } };
      }
    } else if (localSaysPaid) {
      // App already marked paid / ledger covers it — keep paid while QBO catches up.
      patch.openBalance = 0;
      patch.paid = true;
      const d =
        payments[0]?.date ||
        job?.payment?.date ||
        (job?.status && job.status.Paid && job.status.Paid.d) ||
        todayStr();
      patch.status = { Paid: { s: "done", d }, "Follow-up": { s: "done", d } };
    } else {
      // Both sides say still open — use the lower remaining so we don't inflate due.
      const fromLedger = remainingBalance({ ...job, paymentBaseline: baseline, payments }, payments);
      const open = Math.min(qboBalance, fromLedger);
      patch.openBalance = open <= 0.01 ? 0 : open;
      patch.paid = open <= 0.01;
      if (!patch.paid) {
        patch.status = { Paid: { s: "" }, "Follow-up": { s: "" } };
      }
    }
  }
  return patch;
}

/** Merge a new Sola payment into job overlay without marking fully paid on partial pay. */
export function patchFromSolaPayment(job, { amount, ref, method, date }) {
  const payAmt = parseAmount(amount);
  if (payAmt <= 0) return null;
  const payId = ref ? "sola-" + ref : "sola-" + Date.now();
  const existing = normalizePayments(job);
  if (existing.some((p) => p.id === payId)) return null;
  const owedBefore =
    job.paymentBaseline != null && job.paymentBaseline !== ""
      ? parseAmount(job.paymentBaseline)
      : existing.length
        ? amountOwedAtStart(job, existing)
        : parseAmount(job.openBalance) || parseBalanceFromNotes(job) || parseAmount(job.amount);
  const entry = {
    id: payId,
    // Numeric amount only — never "$…" (record_payment enqueue + host parse).
    amount: payAmt,
    method: normalizePaymentMethod(method, { ref }),
    ref: ref || "",
    date: date || todayStr(),
    source: "sola",
    recorded: false,
  };
  const merged = { ...job, paymentBaseline: job.paymentBaseline != null ? job.paymentBaseline : owedBefore };
  return applyPaymentsPatch(merged, [...existing, entry]);
}

export function sumPaymentsList(payments) {
  return totalPaid(payments);
}
