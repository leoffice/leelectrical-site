// Estimate / invoice email send status — "Never sent" vs last delivered send.

const s = (v) => (v == null ? "" : String(v).trim());

export function docNoForJob(job, docKind) {
  if (!job) return "";
  return s(docKind === "invoice" ? job.invoiceNo : job.estimateNo);
}

function kindMatches(entry, docKind) {
  const k = s(entry?.kind).toLowerCase();
  if (!k || k.includes("queued") || k.includes("reminder")) return false;
  if (docKind === "invoice") return k.includes("invoice");
  return k.includes("estimate");
}

function docNoMatches(entry, docNo) {
  if (!docNo) return true;
  return s(entry?.kind).includes(docNo);
}

function isDelivered(entry) {
  const k = s(entry?.kind).toLowerCase();
  if (k.includes("failed") || k.includes("did not")) return false;
  return k.includes("emailed") || /\bemailed\b/.test(k) || k.includes("delivered") || /\binvoice sent\b/.test(k) || /\bestimate sent\b/.test(k);
}

/** Latest delivered send for this doc kind from job history (chronological list). */
export function lastDocSend(job, docKind, { docNo } = {}) {
  const no = docNo != null ? s(docNo) : docNoForJob(job, docKind);
  const hist = job?.invoiceHistory || [];
  for (let i = hist.length - 1; i >= 0; i--) {
    const e = hist[i];
    if (kindMatches(e, docKind) && docNoMatches(e, no) && isDelivered(e)) return e;
  }
  return null;
}

/** True when a send command completed successfully for this job + doc. */
export function docSendSucceeded(commands, job, docKind) {
  const jobId = String(job?.id || "");
  if (!jobId) return false;
  const type = docKind === "invoice" ? "send_invoice" : "send_estimate";
  const docNo = docNoForJob(job, docKind);
  return (commands || []).some((c) => {
    if (!c || c.type !== type || c.status !== "done" || String(c.jobId) !== jobId) return false;
    const pl = c.payload || {};
    const cmdNo = s(pl.invoiceNo || pl.estimateNo);
    if (docNo && cmdNo && cmdNo !== docNo) return false;
    return true;
  });
}

/** True when a send_invoice / send_estimate command is in flight for this job + kind. */
export function docSendInFlight(commands, jobId, docKind) {
  const type = docKind === "invoice" ? "send_invoice" : "send_estimate";
  return (commands || []).some(
    (c) =>
      c &&
      c.type === type &&
      String(c.jobId) === String(jobId) &&
      (c.status === "queued" || c.status === "working")
  );
}

/** Footer line for estimate / invoice sheets. */
export function docSendStatusLine(job, docKind, commands) {
  if (docSendInFlight(commands, job?.id, docKind)) {
    const last = lastDocSend(job, docKind);
    if (last) {
      const to = last.to ? " to " + last.to : "";
      return { state: "sending", text: "Sending now — last sent " + (last.date || "") + to };
    }
    return { state: "sending", text: "Sending now…" };
  }
  const last = lastDocSend(job, docKind);
  if (!last) return { state: "never", text: "Never sent" };
  const to = last.to ? " to " + last.to : "";
  return { state: "sent", text: "Last sent " + (last.date || "") + to };
}