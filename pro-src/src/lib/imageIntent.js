// Shared image-intent logic — vision clues + job lookup + suggested actions (Telegram + bubble).
import { findJobByInvoice, findJobByServiceAddress, parseInvoiceFromMemo } from "./zelleReconcile.js";

/** Collect invoice numbers from vision output + memo. */
export function invoiceHintsFromExtracted(extracted) {
  const out = [];
  for (const n of extracted?.invoiceNumbers || []) {
    const clean = String(n).replace(/\D/g, "");
    if (clean.length >= 5) out.push(clean);
  }
  const memoInv = parseInvoiceFromMemo(extracted?.memo);
  if (memoInv) out.push(memoInv);
  return [...new Set(out)];
}

/**
 * Turn vision output + jobs list into up to 3 tap-ready actions (A/B/C).
 * @returns {Array<{ id: string, label: string, kind: string, job?: object, invoiceNo?: string, amount?: number }>}
 */
export function suggestActionsFromImage({ extracted, jobs, activeJob }) {
  const actions = [];
  const seenJobs = new Set();
  const isPayment =
    extracted?.documentType === "payment" ||
    extracted?.amount > 0 ||
    extracted?.paymentMethod ||
    extracted?.kind === "zelle" ||
    extracted?.kind === "check";

  for (const inv of invoiceHintsFromExtracted(extracted)) {
    const job = findJobByInvoice(jobs, inv);
    if (!job || seenJobs.has(job.id)) continue;
    seenJobs.add(job.id);
    if (isPayment) {
      const amt = extracted?.amount;
      actions.push({
        id: `pay_${inv}`,
        label: amt
          ? `Record $${amt} payment on #${inv}`
          : `Record payment on #${inv}`,
        kind: "record_payment",
        job,
        invoiceNo: inv,
        amount: amt || null,
      });
    }
    actions.push({
      id: `open_${inv}`,
      label: `Open #${inv} — ${job.customer || "job"}`,
      kind: "open_job",
      job,
      invoiceNo: inv,
    });
  }

  for (const addr of extracted?.addresses || []) {
    const job = findJobByServiceAddress(jobs, addr);
    if (!job || seenJobs.has(job.id)) continue;
    seenJobs.add(job.id);
    actions.push({
      id: `open_addr_${job.id}`,
      label: `Open ${job.customer || "job"} — ${addr}`,
      kind: "open_job",
      job,
      address: addr,
    });
  }

  if (activeJob?.id && !seenJobs.has(activeJob.id) && isPayment && extracted?.amount > 0) {
    actions.unshift({
      id: `pay_current_${activeJob.id}`,
      label: `Record $${extracted.amount} on open invoice #${activeJob.invoiceNo || "?"}`,
      kind: "record_payment",
      job: activeJob,
      invoiceNo: activeJob.invoiceNo,
      amount: extracted.amount,
    });
    seenJobs.add(activeJob.id);
  }

  if (!actions.length) {
    actions.push({
      id: "ask_israel",
      label: "Ask Israel what this is",
      kind: "ask",
    });
  }

  const deduped = [];
  const labels = new Set();
  for (const a of actions) {
    if (labels.has(a.label)) continue;
    labels.add(a.label);
    deduped.push(a);
    if (deduped.length >= 3) break;
  }
  return deduped;
}

/** Plain summary for chat / Telegram context. */
export function formatImageIntentSummary(extracted, actions) {
  const bits = [];
  const invs = invoiceHintsFromExtracted(extracted);
  if (invs.length) bits.push("invoice #" + invs.join(", #"));
  if (extracted?.addresses?.length) bits.push("address: " + extracted.addresses[0]);
  if (extracted?.amount > 0) bits.push("$" + extracted.amount);
  if (extracted?.documentType && extracted.documentType !== "other") {
    bits.push(extracted.documentType);
  }
  const clue = bits.length ? bits.join(" · ") : "image attached";
  const opts =
    actions?.length > 1
      ? " Options: " + actions.map((a, i) => String.fromCharCode(65 + i) + ") " + a.label).join(" · ")
      : "";
  return clue + opts;
}

/** Letter labels A/B/C for text fallback when buttons aren't available. */
export function letterOptions(actions) {
  return (actions || []).slice(0, 3).map((a, i) => ({
    letter: String.fromCharCode(65 + i),
    ...a,
  }));
}