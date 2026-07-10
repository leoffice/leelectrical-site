// Change-order jobs — extra invoice or estimate at the same customer + address.
import { cloneJobAtAddressPatch, jobsAtSameAddress, sameAddressGroup } from "./customerHierarchy.js";
import { fmt$ } from "./format.js";
import { linesTotal } from "./qboDoc.js";

/** Next CO sequence for a source job + kind (invoice or estimate). */
export function nextChangeOrderSeq(jobs, sourceJob, kind) {
  const sid = String(sourceJob?.id || "");
  if (!sid) return 1;
  const n = (jobs || []).filter(
    (j) =>
      j?.changeOrder &&
      String(j.changeOrderSourceId || "") === sid &&
      j.changeOrderKind === kind
  ).length;
  return n + 1;
}

/** Display / requested doc number: e.g. 251100-CO-1 */
export function changeOrderDocLabel(sourceJob, kind, seq) {
  const base =
    kind === "estimate"
      ? String(sourceJob?.estimateNo || sourceJob?.invoiceNo || "").trim()
      : String(sourceJob?.invoiceNo || sourceJob?.estimateNo || "").trim();
  const root = base || "CO";
  return root + "-CO-" + seq;
}

/** One-line job title from line items + amount. */
export function briefJobTitleFromDoc(lines, amount) {
  const descs = (lines || [])
    .map((ln) => String(ln.description || ln.itemName || "").trim())
    .filter(Boolean);
  let summary = descs[0] || "Change order";
  if (summary.length > 72) summary = summary.slice(0, 69) + "…";
  const amt = amount != null && parseAmountSafe(amount) > 0 ? " — " + fmt$(amount) : "";
  return summary + amt;
}

function parseAmountSafe(v) {
  const n = parseFloat(String(v || "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** True when a change-order job should appear in the address carousel. */
export function changeOrderReadyForCarousel(job) {
  if (!job?.changeOrder) return true;
  const kind = job.changeOrderKind || "invoice";
  const confirmed = kind === "estimate" ? !!job._estimateConfirmed : !!job._invoiceConfirmed;
  const hasNo = kind === "estimate" ? !!job.estimateNo : !!job.invoiceNo;
  const lines = kind === "estimate" ? job.estimateLines : job.invoiceLines;
  const hasDescription = !!(job.title?.trim() || (lines || []).some((ln) => ln.description?.trim()));
  const emailed = !!job._docEmailed;
  return confirmed && hasNo && hasDescription && emailed;
}

/** Jobs visible in the address carousel (hides draft COs merged under a lead). */
export function carouselVisibleJobs(jobs, anchorJob) {
  const all = jobsAtSameAddress(jobs, anchorJob);
  return all.filter((j) => {
    const lead = String(j.jobInfoLeadId || "").trim();
    if (lead && lead !== String(j.id)) return false;
    if (!j.changeOrder) return true;
    return changeOrderReadyForCarousel(j);
  });
}

/** True when user can start another change order (no pending draft CO at address). */
export function canAddChangeOrder(jobs, sourceJob) {
  const addrJobs = jobsAtSameAddress(jobs, sourceJob);
  const pending = addrJobs.some((j) => j.changeOrder && !changeOrderReadyForCarousel(j));
  return !pending;
}

/** Patch for a new change-order job cloned from an existing one. */
export function changeOrderJobPatch(sourceJob, kind = "invoice", allJobs = []) {
  const base = cloneJobAtAddressPatch(sourceJob);
  const seq = nextChangeOrderSeq(allJobs, sourceJob, kind);
  const label = changeOrderDocLabel(sourceJob, kind, seq);
  const kindLabel = kind === "estimate" ? "Change order estimate" : "Change order invoice";
  return {
    ...base,
    title: kindLabel + " " + label,
    changeOrder: true,
    changeOrderKind: kind,
    changeOrderSourceId: sourceJob.id,
    changeOrderSeq: seq,
    changeOrderLabel: label,
    _estimateConfirmed: false,
    _invoiceConfirmed: false,
    _docEmailed: false,
  };
}

/** Title patch after doc save / QB confirm. */
export function briefTitlePatch(job, kind) {
  const lines = kind === "estimate" ? job.estimateLines : job.invoiceLines;
  const total = linesTotal(lines) || parseAmountSafe(job.amount);
  const title = briefJobTitleFromDoc(lines, total);
  const co =
    job.changeOrder && job.changeOrderLabel
      ? (kind === "estimate" ? "Est " : "Inv ") + job.changeOrderLabel + ": "
      : "";
  return { title: co + title, description: (lines || []).map((ln) => ln.description).filter(Boolean).join("; ") };
}

/** Jobs at same address that can be linked (opposite doc kind). */
export function sameAddressDocsForConnect(jobs, job, pressedKind) {
  const list = jobsAtSameAddress(jobs, job).filter((j) => j.id !== job.id);
  if (pressedKind === "invoice") {
    return list.filter((j) => j.estimateNo && !j.jobInfoLeadId);
  }
  return list.filter((j) => j.invoiceNo && !j.jobInfoLeadId);
}

/** Patch to link pressed job to selected docs; optional merge onto same job info card. */
export function connectDocsPatch(pressedJob, selectedJobs, { sameJobInfo = false } = {}) {
  const patches = {};
  const leadId = sameJobInfo ? pressedJob.id : "";
  if (pressedJob.estimateNo && !pressedJob.invoiceNo) {
    const inv = selectedJobs.find((j) => j.invoiceNo);
    if (inv) {
      patches[pressedJob.id] = {
        invoiceNo: inv.invoiceNo,
        linkedInvoiceJobId: inv.id,
        ...(leadId ? { jobInfoLeadId: leadId } : {}),
      };
    }
  } else if (pressedJob.invoiceNo) {
    const est = selectedJobs.find((j) => j.estimateNo);
    if (est) {
      patches[pressedJob.id] = {
        estimateNo: est.estimateNo,
        linkedEstimateJobId: est.id,
        ...(leadId ? { jobInfoLeadId: leadId } : {}),
      };
    }
  }
  if (sameJobInfo && leadId) {
    for (const j of selectedJobs) {
      if (j.id === pressedJob.id) continue;
      patches[j.id] = { ...(patches[j.id] || {}), jobInfoLeadId: leadId };
    }
  }
  return patches;
}

export { sameAddressGroup };