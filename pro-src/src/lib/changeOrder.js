// Change-order jobs — extra invoice or estimate at the same customer + address.
import { cloneJobAtAddressPatch, jobsAtSameAddress, sameAddressGroup } from "./customerHierarchy.js";
import { openBalance, invoiceTotal, amountPaid } from "./customers.js";
import { fmt$ } from "./format.js";
import { linesTotal } from "./qboDoc.js";

const CO_TEXT_RE = /change\s*ord(?:er|ers)?\b|change\s*over\b/i;
const CO_DOC_RE = /(?:^|[\s\-_/])CO[\s\-_]*(\d+)\b/i;
const CO_LINE_RE = /^\s*change\s*ord(?:er|ers)?\b|change\s*order\s*(?:for|:)|change\s*over\b/i;

function parseAmountSafe(v) {
  const n = parseFloat(String(v || "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function jobAlive(j) {
  return !!(j && !j._archived && !j._deleted);
}

/** True when free text looks like a change-order description (not "including all COs"). */
export function textLooksLikeChangeOrder(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (/including all the change orders/i.test(s)) return false;
  return CO_TEXT_RE.test(s) || CO_DOC_RE.test(s);
}

/** Parse CO sequence from a doc number like 251100-CO-2 or CO-3. */
export function seqFromDocNumber(docNo) {
  const s = String(docNo || "");
  const m = s.match(/-CO-(\d+)\b/i) || s.match(/\bCO[\s\-_]*(\d+)\b/i);
  return m ? parseInt(m[1], 10) : 0;
}

/** Parse QuickBooks "CO / PI" custom field (e.g. "01", "11 (007)") → sequence #. */
export function seqFromCoPi(val) {
  const m = String(val || "").trim().match(/^0*(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** True when this job is (or should be treated as) a change-order document. */
export function isChangeOrderJob(job) {
  if (!job || !jobAlive(job)) return false;
  if (job.changeOrder) return true;
  if (job.changeOrderSeq != null && Number(job.changeOrderSeq) > 0) return true;
  if (String(job.changeOrderLabel || "").trim()) return true;
  // QuickBooks sales-form custom field "CO / PI" (Joy Construction etc.)
  if (seqFromCoPi(job.qboCoPi || job.coPi)) return true;
  if (textLooksLikeChangeOrder(job.title)) return true;
  if (seqFromDocNumber(job.invoiceNo) || seqFromDocNumber(job.estimateNo)) return true;
  return false;
}

/** CO line items stored on a parent invoice (mixed invoices from QuickBooks). */
export function changeOrderLinesOf(job) {
  const stored = Array.isArray(job?.changeOrderLines) ? job.changeOrderLines : [];
  if (stored.length) return stored;
  const lines = job?.invoiceLines || job?.estimateLines || [];
  return lines
    .map((ln, idx) => ({ ...ln, _idx: idx }))
    .filter((ln) => CO_LINE_RE.test(String(ln.description || ln.itemName || "")));
}

/** Human label: "Change Order 1" / "Change Order Estimate 2". */
export function changeOrderDisplayName(jobOrSeq, kind = "invoice") {
  const seq =
    typeof jobOrSeq === "number"
      ? jobOrSeq
      : Number(jobOrSeq?.changeOrderSeq) ||
        seqFromDocNumber(jobOrSeq?.invoiceNo || jobOrSeq?.estimateNo) ||
        seqFromDocNumber(jobOrSeq?.changeOrderLabel) ||
        0;
  const n = seq > 0 ? seq : 1;
  if (kind === "estimate" || jobOrSeq?.changeOrderKind === "estimate") {
    return "Change Order Estimate " + n;
  }
  return "Change Order " + n;
}

/** Next CO sequence for a source job + kind (invoice or estimate). */
export function nextChangeOrderSeq(jobs, sourceJob, kind) {
  const sid = String(sourceJob?.id || "");
  let max = 0;
  // Count by explicit source id (works even when address fields incomplete)
  for (const j of jobs || []) {
    if (!j?.changeOrder && !isChangeOrderJob(j)) continue;
    if (kind && (j.changeOrderKind || "invoice") !== kind) continue;
    if (sid && String(j.changeOrderSourceId || "") !== sid) continue;
    if (!sid && j.id === sourceJob?.id) continue;
    const s =
      Number(j.changeOrderSeq) ||
      seqFromDocNumber(j.changeOrderLabel) ||
      seqFromDocNumber(j.invoiceNo || j.estimateNo) ||
      0;
    // Untagged CO under source still bumps the count
    const n = s > 0 ? s : max + 1;
    if (n > max) max = n;
  }
  // Same-address group COs + CO lines on originals
  const group = changeOrderJobsForSource(jobs, sourceJob, kind);
  for (const j of group) {
    const s =
      Number(j.changeOrderSeq) ||
      seqFromDocNumber(j.changeOrderLabel) ||
      seqFromDocNumber(j.invoiceNo || j.estimateNo) ||
      0;
    if (s > max) max = s;
  }
  const addr = jobsAtSameAddress(jobs, sourceJob);
  for (const j of addr) {
    if (isChangeOrderJob(j)) continue;
    for (const ln of changeOrderLinesOf(j)) {
      const s = Number(ln.changeOrderSeq) || 0;
      if (s > max) max = s;
    }
  }
  return max + 1;
}

/** Display / requested doc number: e.g. 251100-CO-1 (original invoice # + -CO- + seq). */
export function changeOrderDocLabel(sourceJob, kind, seq) {
  const base =
    kind === "estimate"
      ? String(sourceJob?.estimateNo || sourceJob?.invoiceNo || "").trim()
      : String(sourceJob?.invoiceNo || sourceJob?.estimateNo || "").trim();
  // Strip any existing -CO-N so we never nest (251100-CO-1-CO-2).
  const root = String(base || "CO").replace(/-CO-\d+\b/i, "").trim() || "CO";
  return root + "-CO-" + seq;
}

/**
 * Invoice/estimate DocNumber to send to QuickBooks for a change-order job.
 * Uses original# + -CO- + N so the generated doc is e.g. 251100-CO-1.
 * Empty when not a CO or when a real confirmed number already exists.
 */
export function preferredChangeOrderDocNo(job, kind = "invoice") {
  if (!job) return "";
  const existing =
    kind === "estimate" ? String(job.estimateNo || "").trim() : String(job.invoiceNo || "").trim();
  // Already has a real number (possibly already CO-formatted) — keep it.
  if (existing && (kind === "estimate" ? job._estimateConfirmed : job._invoiceConfirmed)) {
    return existing;
  }
  if (existing && /-CO-\d+\b/i.test(existing)) return existing;
  const label = String(job.changeOrderLabel || "").trim();
  if (label) return label;
  if (!job.changeOrder && !isChangeOrderJob(job)) return "";
  const seq =
    Number(job.changeOrderSeq) ||
    seqFromDocNumber(job.changeOrderLabel) ||
    seqFromCoPi(job.qboCoPi || job.coPi) ||
    0;
  if (seq > 0) {
    // Best-effort label from whatever base we still have on the job.
    return changeOrderDocLabel(job, kind, seq);
  }
  return existing || "";
}

/**
 * Best parent job at the same address to hang a new change order off
 * (prefers non-CO invoice with a doc number).
 */
export function bestChangeOrderSource(jobs, anchorJob) {
  if (!anchorJob) return null;
  const addr = jobsAtSameAddress(jobs, anchorJob);
  const pool = addr.length ? addr : [anchorJob];
  const originals = pool.filter((j) => jobAlive(j) && !isChangeOrderJob(j));
  const withInv = originals.find((j) => String(j.invoiceNo || "").trim());
  if (withInv) return withInv;
  const withEst = originals.find((j) => String(j.estimateNo || "").trim());
  if (withEst) return withEst;
  if (!isChangeOrderJob(anchorJob)) return anchorJob;
  return originals[0] || anchorJob;
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
  const display = changeOrderDisplayName(seq, kind);
  return {
    ...base,
    title: display + " · " + label,
    changeOrder: true,
    changeOrderKind: kind,
    changeOrderSourceId: sourceJob.id,
    changeOrderSeq: seq,
    changeOrderLabel: label,
    _estimateConfirmed: false,
    _invoiceConfirmed: false,
    _docEmailed: false,
    _draftChangeOrder: true,
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
      : job.changeOrder
        ? changeOrderDisplayName(job, kind) + ": "
        : "";
  return { title: co + title, description: (lines || []).map((ln) => ln.description).filter(Boolean).join("; ") };
}

/** All CO jobs for a source (explicit sourceId or same address group). */
export function changeOrderJobsForSource(jobs, sourceJob, kind = null) {
  if (!sourceJob) return [];
  const sid = String(sourceJob.id || "");
  const addr = jobsAtSameAddress(jobs, sourceJob);
  return (addr.length ? addr : jobs || [])
    .filter((j) => {
      if (!jobAlive(j) || !isChangeOrderJob(j)) return false;
      if (kind && (j.changeOrderKind || "invoice") !== kind) return false;
      const src = String(j.changeOrderSourceId || "");
      if (src) return src === sid || addr.some((a) => String(a.id) === src);
      // Untagged CO at same address counts for the group
      return addr.some((a) => a.id === j.id);
    })
    .sort(sortChangeOrders);
}

function sortChangeOrders(a, b) {
  const sa =
    Number(a.changeOrderSeq) ||
    seqFromDocNumber(a.changeOrderLabel) ||
    seqFromDocNumber(a.invoiceNo || a.estimateNo) ||
    0;
  const sb =
    Number(b.changeOrderSeq) ||
    seqFromDocNumber(b.changeOrderLabel) ||
    seqFromDocNumber(b.invoiceNo || b.estimateNo) ||
    0;
  if (sa && sb && sa !== sb) return sa - sb;
  if (sa && !sb) return -1;
  if (!sa && sb) return 1;
  return String(a.invoiceNo || a.estimateNo || a.id).localeCompare(
    String(b.invoiceNo || b.estimateNo || b.id)
  );
}

/** Union of CO rows across all jobs (customer-level tab). */
export function changeOrderTabRowsAll(jobs) {
  const byId = new Map();
  for (const j of jobs || []) {
    if (!jobAlive(j)) continue;
    for (const r of changeOrderTabRows(jobs, j)) {
      if (!byId.has(r.id)) byId.set(r.id, r);
    }
  }
  return [...byId.values()].sort(
    (a, b) => a.seq - b.seq || String(a.docNo).localeCompare(String(b.docNo))
  );
}

/**
 * Build expandable Change Order tab rows for a job context.
 * Includes: separate CO jobs + CO lines on original invoices at the same address.
 */
export function changeOrderTabRows(jobs, sourceJob) {
  if (!sourceJob) return [];
  const rows = [];
  const addr = jobsAtSameAddress(jobs, sourceJob);
  const pool = addr.length ? addr : [sourceJob];
  const seenJobIds = new Set();

  // Separate CO jobs first
  const coJobs = pool.filter(isChangeOrderJob).sort(sortChangeOrders);
  let seq = 0;
  for (const j of coJobs) {
    seenJobIds.add(j.id);
    seq = Number(j.changeOrderSeq) || seqFromDocNumber(j.changeOrderLabel) || seqFromDocNumber(j.invoiceNo) || seq + 1;
    const total = invoiceTotal(j);
    const due = openBalance(j);
    const paid = amountPaid(j);
    const lines = j.invoiceLines || j.estimateLines || [];
    rows.push({
      id: "job:" + j.id,
      kind: "job",
      job: j,
      jobId: j.id,
      seq,
      label: changeOrderDisplayName({ ...j, changeOrderSeq: seq }, j.changeOrderKind || "invoice"),
      docNo: j.invoiceNo || j.estimateNo || "",
      docKind: j.changeOrderKind || (j.estimateNo && !j.invoiceNo ? "estimate" : "invoice"),
      amount: total,
      balance: due,
      paid: !!(j.paid || due <= 0.01),
      amountLine: formatCoAmountLine(total, paid, due, j.paid),
      balanceLine: formatCoBalanceLine(total, paid, due, j.paid || due <= 0.01),
      description: firstLineDesc(lines) || j.title || "",
      lines,
      statusLabel: j.paid || due <= 0.01 ? "Paid" : due > 0.01 && paid > 0.01 ? "Partial" : "Open",
    });
  }

  // CO line items on non-CO invoices at this address
  for (const j of pool) {
    if (seenJobIds.has(j.id) || isChangeOrderJob(j)) continue;
    const coLines = changeOrderLinesOf(j);
    if (!coLines.length) continue;
    coLines.forEach((ln, i) => {
      seq += 1;
      const amt = parseAmountSafe(ln.amount != null ? ln.amount : (ln.qty || 1) * (ln.unitPrice || 0));
      const invPaid = !!(j.paid || openBalance(j) <= 0.01);
      // Line on a paid parent invoice has $0 open balance; otherwise treat as open.
      const lineBal = invPaid ? 0 : amt;
      rows.push({
        id: "line:" + j.id + ":" + (ln._idx != null ? ln._idx : i),
        kind: "line",
        job: j,
        jobId: j.id,
        seq: Number(ln.changeOrderSeq) || seq,
        label: changeOrderDisplayName(Number(ln.changeOrderSeq) || seq, "invoice"),
        docNo: j.invoiceNo || "",
        docKind: "invoice",
        amount: amt,
        balance: lineBal,
        paid: invPaid,
        amountLine: amt > 0 ? fmt$(amt) : "",
        balanceLine: formatCoBalanceLine(amt, invPaid ? amt : 0, lineBal, invPaid),
        description: String(ln.description || ln.itemName || "").trim(),
        lines: [ln],
        statusLabel: invPaid ? "Paid" : "On invoice",
        parentInvoiceNo: j.invoiceNo || "",
      });
    });
  }

  // Re-number display seq 1..n if any missing
  let auto = 0;
  for (const r of rows) {
    if (!r.seq) {
      auto += 1;
      r.seq = auto;
      r.label = changeOrderDisplayName(auto, r.docKind);
    } else if (r.seq > auto) {
      auto = r.seq;
    }
  }
  rows.sort((a, b) => a.seq - b.seq || String(a.docNo).localeCompare(String(b.docNo)));
  return rows;
}

function firstLineDesc(lines) {
  for (const ln of lines || []) {
    const d = String(ln.description || ln.itemName || "").trim();
    if (d) return d.length > 120 ? d.slice(0, 117) + "…" : d;
  }
  return "";
}

function formatCoAmountLine(total, paid, due, fullyPaid) {
  // Always surface the change-order amount; balance is separate on the row UI.
  if (fullyPaid || due <= 0.01) {
    return total > 0 ? fmt$(total) : "Paid";
  }
  if (total > 0) return fmt$(total);
  if (due > 0.01) return fmt$(due);
  return paid > 0.01 ? fmt$(paid) : "";
}

/** Balance line for CO tab rows (open amount remaining). */
export function formatCoBalanceLine(total, paid, due, fullyPaid) {
  if (fullyPaid || due <= 0.01) return "Balance $0";
  if (due > 0.01) return "Balance " + fmt$(due);
  if (paid > 0.01 && total > 0) return "Balance " + fmt$(Math.max(0, total - paid));
  return total > 0 ? "Balance " + fmt$(total) : "";
}

/**
 * Infer a patch that tags an existing board job as a change order.
 * Used when reclassifying synced invoices that are really COs.
 */
export function tagChangeOrderPatch(job, sourceJob, seq, kind = "invoice") {
  const s = seq || Number(job?.changeOrderSeq) || seqFromDocNumber(job?.invoiceNo) || 1;
  const src = sourceJob || job;
  const label = job?.changeOrderLabel || changeOrderDocLabel(src, kind, s);
  return {
    changeOrder: true,
    changeOrderKind: kind,
    changeOrderSourceId: src?.id || job?.id,
    changeOrderSeq: s,
    changeOrderLabel: label,
  };
}

/**
 * Build changeOrderLines array from QBO-style line objects for storage on a job.
 */
export function buildChangeOrderLinesFromQbo(lines) {
  const out = [];
  let seq = 0;
  (lines || []).forEach((ln, idx) => {
    const desc = String(ln.description || ln.Description || ln.item || ln.itemName || "").trim();
    if (!CO_LINE_RE.test(desc) && !textLooksLikeChangeOrder(desc)) return;
    if (/including all the change orders/i.test(desc)) return;
    seq += 1;
    const amt =
      ln.amount != null
        ? parseAmountSafe(ln.amount)
        : parseAmountSafe(ln.Amount) || parseAmountSafe(ln.qty || ln.Qty) * parseAmountSafe(ln.unitPrice || ln.UnitPrice);
    out.push({
      description: desc,
      itemName: ln.item || ln.itemName || "",
      amount: amt,
      qty: ln.qty != null ? ln.qty : ln.Qty != null ? ln.Qty : 1,
      unitPrice: ln.unitPrice != null ? ln.unitPrice : ln.UnitPrice,
      changeOrderSeq: seq,
      _idx: idx,
    });
  });
  return out;
}

/** True if invoice is predominantly a change-order document (all $ on CO lines). */
export function invoiceIsPureChangeOrder(lines, total) {
  const coLines = buildChangeOrderLinesFromQbo(lines);
  if (!coLines.length) return false;
  const coSum = coLines.reduce((s, ln) => s + parseAmountSafe(ln.amount), 0);
  const t = parseAmountSafe(total);
  if (t <= 0) return coLines.length === (lines || []).length;
  return coSum >= t * 0.85;
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
