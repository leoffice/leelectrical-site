// Pay-link refresh-on-open (Levi 2026-08-12, invoice 251854).
//
// Short pay links used to be a SNAPSHOT: the payload (balance, work text,
// addresses) was baked into KV when the email was sent and never touched
// again, so a customer opening an old link saw the balance as of send time —
// $2,300 on an invoice that had since changed. Every JSON resolve now rebuilds
// the money + content fields from the LIVE job (jobsdata ⊕ the ov edit
// overlay, exactly what the office app renders) so a pay link can never show
// a stale amount again. Link-intent fields (fee flag, full-pay-only, cardknox
// URL, recipient email, deliberate partial amounts) stay as minted.

import { getStore } from "./storage/index.mjs";
import { deepMerge, isPlainObject } from "./ovPatch.mjs";
import {
  amountPaid,
  invoiceTotal,
  isBalanceExemptOffer,
  normalizePayments,
  openBalance,
  parseAmount,
} from "./invoiceBalance.mjs";
import {
  billToAddressForJob,
  compactLines,
  firstAddressParagraph,
  workDescription,
} from "./payLandingLink.mjs";

const JOBS_KEY = "jobsdata-v1";
const OV_KEY = "ov-v1";

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Find the live job for an invoice: jobsdata merged with the ov edit overlay
 * (user edits always win at render time — state.mjs contract).
 *
 * Invoice numbers are NOT unique (251854 belongs to both Gabriel development
 * and Goodness and kindness), so a bare invoiceNo only resolves when it is
 * unambiguous or the customer name matches — never guess across customers.
 */
export async function loadLiveInvoiceJob({ invoiceNo = "", jobId = "", customer = "" } = {}) {
  let doc;
  try {
    doc = await getStore("jobsdata").get(JOBS_KEY, { type: "json" });
  } catch (err) {
    console.error("[pay-link] refresh: jobsdata read failed", err);
    return null;
  }
  const jobs = Array.isArray(doc?.jobs) ? doc.jobs : [];
  const wantId = String(jobId || "").trim();
  const wantInv = String(invoiceNo || "").trim();
  let job = wantId ? jobs.find((j) => j && String(j.id || "") === wantId) || null : null;
  if (!job && wantInv) {
    const matches = jobs.filter((j) => j && String(j.invoiceNo || "").trim() === wantInv);
    if (matches.length === 1) {
      job = matches[0];
    } else if (matches.length > 1) {
      const want = normName(customer);
      const named = want ? matches.filter((j) => normName(j.customer) === want) : [];
      // Prefer the newest edit when the same customer has clones of the invoice.
      if (named.length) {
        job = named.sort((a, b) => (Number(a._savedAt) || 0) - (Number(b._savedAt) || 0)).pop();
      }
    } else {
      job = jobs.find((j) => j && String(j.id || "").includes(wantInv)) || null;
    }
  }
  if (!job) return null;
  try {
    const ovDoc = await getStore("jobstate").get(OV_KEY, { type: "json" });
    const patch = ovDoc?.ov?.[String(job.id)];
    if (isPlainObject(patch)) job = deepMerge(job, patch);
  } catch (err) {
    // Overlay unavailable — jobsdata alone still beats a frozen snapshot.
    console.error("[pay-link] refresh: ov overlay read failed", err);
  }
  return job;
}

function paymentRows(job) {
  return normalizePayments(job).map((p) => ({
    a: money(parseAmount(p.amount)),
    m: String(p.method || "").trim(),
    d: String(p.date || "").trim(),
    r: String(p.ref || "").trim(),
  }));
}

/**
 * Rebuild a stored invoice pay-link payload from the live job. Balance math is
 * the client's own (invoiceBalance.mjs parity copies), so the link always
 * agrees with what the office app shows. Returns null when the record must not
 * be refreshed (estimate landings, or no live job resolved).
 */
export function refreshedInvoicePayload(stored, job) {
  if (!stored || !stored.i) return null;
  if (stored.k === "e" || stored.kind === "estimate") return null;
  if (!job) return null;

  const total = invoiceTotal(job);
  const hasExplicitOpen = job.openBalance != null && job.openBalance !== "";
  const rawDue = hasExplicitOpen ? parseAmount(job.openBalance) : parseAmount(job.amount);
  // Provisional renew offers are exempt from customer-total rollups but the
  // pay page still shows the real remaining amount (mirrors the client's
  // buildPayLandingPayload, Levi 2026-08-10).
  const due = isBalanceExemptOffer(job) && rawDue > 0 ? rawDue : openBalance(job) || rawDue;
  const paid = amountPaid(job);

  // A deliberately partial "pay $X" link keeps its partial amount while that
  // much is still owed; everything else follows the live balance.
  const storedA = parseAmount(stored.a);
  const storedD = parseAmount(stored.d);
  const partial = storedA > 0 && storedD > 0 && storedA < storedD - 0.009;

  const payload = {
    ...stored,
    j: String(job.id || stored.j || "").trim(),
    a: due <= 0.009 ? 0 : partial && storedA <= due + 0.009 ? storedA : due,
    c: String(job.customer || stored.c || "").trim(),
    w: workDescription(job),
    t: total > 0 ? money(total) : String(job.amount || stored.t || ""),
    d: due > 0.009 ? money(due) : "Paid in full",
    p: paid > 0 ? money(paid) : "",
    ps: paymentRows(job),
    ph: String(job.phone || "").trim(),
    sa: firstAddressParagraph(job.serviceAddress || job.address || ""),
    ba: billToAddressForJob(job),
    z: String(job.zip || "").trim() || stored.z || "",
    as: new Date().toISOString().slice(0, 10),
    k: "i",
  };
  const lines = compactLines(job, "invoice");
  if (lines.length) payload.lines = lines;
  else delete payload.lines;
  // Money changed vs the minted snapshot → the stored PDF is stale too; rf
  // tells the pay page to build the PDF from this payload instead.
  const moneyChanged = ["a", "t", "d", "p"].some(
    (k) => String(stored[k] ?? "") !== String(payload[k] ?? "")
  );
  if (moneyChanged) payload.rf = 1;
  else delete payload.rf;
  return payload;
}
