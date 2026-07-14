// Estimate / invoice email send status — "Never sent" vs last delivered send.

const s = (v) => (v == null ? "" : String(v).trim());

function kindMatches(entry, docKind) {
  const k = s(entry?.kind).toLowerCase();
  if (!k || k.includes("queued") || k.includes("reminder")) return false;
  if (docKind === "invoice") return k.includes("invoice");
  return k.includes("estimate");
}

function isDelivered(entry) {
  const k = s(entry?.kind).toLowerCase();
  return k.includes("emailed") || /\bsent\b/.test(k) || k.includes("delivered");
}

/** Latest delivered send for this doc kind from job history (chronological list). */
export function lastDocSend(job, docKind) {
  const hist = job?.invoiceHistory || [];
  for (let i = hist.length - 1; i >= 0; i--) {
    const e = hist[i];
    if (kindMatches(e, docKind) && isDelivered(e)) return e;
  }
  return null;
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