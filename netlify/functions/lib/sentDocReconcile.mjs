// Self-heal for sent-but-unsaved invoices — Levi 2026-08-11.
//
// Invoice LE-251859 was emailed to a customer, minted a pay link, and stored
// its PDF — then the app record never landed, so LE Pro showed the customer
// $0 and no transactions while the customer held a real $500 invoice.
//
// Sending writes durable customer-side artifacts (a paylinks/pl-<code> record
// carrying the invoice number, job id, amount and line items). That makes the
// pay store an authoritative witness of "this invoice really went out". This
// module compares those witnesses against the app's own overlay and produces
// patches for anything the app is missing.
//
// Rules that keep it safe:
//   - NEVER invents an invoice: every field comes from the pay-link payload.
//   - NEVER renumbers: the original invoice number is reused, so the customer's
//     copy and the books agree.
//   - Reuses the SAME pay code, so a payment on the link already in the
//     customer's inbox still reconciles.
//   - Idempotent: a job that already carries that invoice number is skipped,
//     and a job carrying a DIFFERENT invoice is never overwritten.
//
// Pure functions only — the endpoint supplies the data and performs the write.

/** Pay-link payload keys (they are single-letter to keep the record small). */
const P = {
  job: "j",
  invoiceNo: "i",
  amount: "a",
  customer: "c",
  work: "w",
  email: "e",
  phone: "ph",
  serviceAddress: "sa",
  billingAddress: "ba",
  asOf: "as",
  kind: "k",
};

const str = (v) => String(v == null ? "" : v).trim();

/** Money from the payload — "a" is a number, "d"/"t" are display strings. */
function amountOf(payload) {
  const n = Number(payload?.[P.amount]);
  if (Number.isFinite(n) && n > 0) return n;
  const fromDisplay = parseFloat(str(payload?.d || payload?.t).replace(/[^0-9.]/g, ""));
  return Number.isFinite(fromDisplay) ? fromDisplay : 0;
}

/** Invoice numbers already present anywhere in the overlay. */
export function invoiceNumbersInStore(ov = {}) {
  const seen = new Set();
  for (const [key, job] of Object.entries(ov || {})) {
    if (key.startsWith("_") || !job || typeof job !== "object") continue;
    const no = str(job.invoiceNo);
    if (no) seen.add(no.toUpperCase());
  }
  return seen;
}

/**
 * Compare pay-link witnesses against the overlay.
 *
 * @param {Array<{ code: string, record: object }>} payLinks
 * @param {Record<string, object>} ov the app's job overlay
 * @returns {{ missing: Array<object>, skipped: Array<object> }}
 */
export function findUnsavedSentInvoices(payLinks = [], ov = {}) {
  const present = invoiceNumbersInStore(ov);
  const missing = [];
  const skipped = [];
  const candidates = [];

  for (const entry of payLinks || []) {
    const code = str(entry?.code);
    const record = entry?.record || {};
    const payload = record?.payload || record || {};
    const invoiceNo = str(payload[P.invoiceNo]);
    const jobId = str(payload[P.job]);
    const kind = str(payload[P.kind] || "i");

    if (!invoiceNo || !jobId) {
      skipped.push({ code, invoiceNo, reason: "incomplete_paylink" });
      continue;
    }
    if (kind && kind !== "i") {
      skipped.push({ code, invoiceNo, reason: "not_an_invoice" });
      continue;
    }
    if (/^qbo-/i.test(jobId)) {
      // A qbo-* job's invoice of record lives in QuickBooks; the overlay not
      // carrying a copy is normal, not data loss — and re-materializing one
      // as unpaid/full-balance would contradict QBO for invoices already paid.
      skipped.push({ code, invoiceNo, jobId, reason: "qbo_backed" });
      continue;
    }
    if (present.has(invoiceNo.toUpperCase())) {
      skipped.push({ code, invoiceNo, reason: "already_in_store" });
      continue;
    }
    const job = ov[jobId];
    if (!job || typeof job !== "object") {
      // The job itself is gone — re-materializing a bare invoice with no
      // customer record would be worse than leaving it for a human.
      skipped.push({ code, invoiceNo, reason: "job_missing" });
      continue;
    }
    const existing = str(job.invoiceNo);
    if (existing && existing.toUpperCase() !== invoiceNo.toUpperCase()) {
      skipped.push({ code, invoiceNo, reason: "job_has_other_invoice", existing });
      continue;
    }

    candidates.push({
      code,
      invoiceNo,
      jobId,
      customer: str(payload[P.customer]) || str(job.customer),
      amount: amountOf(payload),
      payload,
      sentAt: Number(record?.createdAt) || 0,
    });
  }

  // One invoice per job: several links can witness the same invoice-less job
  // (a send retried under a fresh number). What the customer holds is the LAST
  // send, so only that one is restored — first-wins would pin a stale number
  // onto the job and orphan the link actually in the customer's inbox.
  const byJob = new Map();
  for (const c of candidates) {
    const cur = byJob.get(c.jobId);
    if (!cur) {
      byJob.set(c.jobId, c);
      continue;
    }
    const newer =
      c.sentAt !== cur.sentAt
        ? c.sentAt > cur.sentAt
        : c.invoiceNo.localeCompare(cur.invoiceNo, undefined, { numeric: true }) > 0;
    const loser = newer ? cur : c;
    if (newer) byJob.set(c.jobId, c);
    skipped.push({
      code: loser.code,
      invoiceNo: loser.invoiceNo,
      reason: "superseded_by_newer_send",
      winner: (newer ? c : cur).invoiceNo,
    });
  }

  const claimed = new Set();
  for (const c of byJob.values()) {
    if (claimed.has(c.invoiceNo.toUpperCase())) {
      skipped.push({ code: c.code, invoiceNo: c.invoiceNo, reason: "already_in_store" });
      continue;
    }
    claimed.add(c.invoiceNo.toUpperCase());
    missing.push(c);
  }

  return { missing, skipped };
}

/** ISO date (YYYY-MM-DD) from the payload's as-of, else the record timestamp. */
function dateFor(payload, record) {
  const asOf = str(payload?.[P.asOf]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return asOf;
  const ts = Number(record?.createdAt);
  const d = Number.isFinite(ts) && ts > 0 ? new Date(ts) : new Date();
  return d.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Build the job patch that re-materializes one sent invoice.
 * Every value is copied from the pay-link payload — nothing is invented.
 *
 * @param {object} found one entry from findUnsavedSentInvoices().missing
 * @param {object} job the current job in the overlay
 * @param {object} [record] the raw pay-link record (for createdAt)
 * @param {number} [now]
 */
export function buildRecoveredInvoicePatch(found, job = {}, record = null, now = Date.now()) {
  const payload = found?.payload || {};
  const invoiceDate = dateFor(payload, record);
  const dueDate = addDays(invoiceDate, 1);
  const amount = found?.amount || amountOf(payload);
  const description = str(payload[P.work]) || "Invoice";

  const lines =
    Array.isArray(payload.lines) && payload.lines.length
      ? payload.lines.map((l) => ({
          itemName: str(l?.itemName),
          itemId: str(l?.itemId),
          description: str(l?.description) || description,
          qty: Number(l?.qty) || 1,
          unitPrice: Number(l?.unitPrice) || amount,
        }))
      : [{ itemName: "", itemId: "", description, qty: 1, unitPrice: amount }];

  const status = { ...(job.status || {}) };
  for (const stage of [
    "Lead", "Site Visit", "Estimate", "Accepted", "Invoiced",
    "Deposit Receipt", "Paperwork", "Scheduled", "Done", "Follow-up", "Paid",
  ]) {
    if (!status[stage]) status[stage] = { s: "" };
  }
  status.Invoiced = { s: "done", d: invoiceDate };

  const attachments = Array.isArray(job.attachments) ? job.attachments.slice() : [];
  const docUrl = `/.netlify/functions/docs?key=inv-${found.invoiceNo}`;
  if (!attachments.some((a) => str(a?.url).endsWith(`inv-${found.invoiceNo}`))) {
    attachments.push({
      id: `att-recovered-inv-${found.invoiceNo}`,
      name: `Invoice_${found.invoiceNo}.pdf`,
      url: docUrl,
      mime: "application/pdf",
      attachToEmail: false,
      addedAt: Number(record?.createdAt) || now,
    });
  }

  return {
    invoiceNo: found.invoiceNo,
    invoiceDate,
    dueDate,
    amount,
    openBalance: amount,
    paid: false,
    invoiceLines: lines,
    description,
    title: description,
    status,
    _invoiceConfirmed: true,
    // The SAME pay code the customer already has — a payment on that link
    // still reconciles against this invoice.
    payCode: found.code,
    payUrl: `https://leelectrical.us/pay/${found.code}`,
    docKey: `inv-${found.invoiceNo}`,
    attachments,
    email: str(job.email) || str(payload[P.email]),
    phone: str(job.phone) || str(payload[P.phone]),
    serviceAddress: str(job.serviceAddress) || str(payload[P.serviceAddress]),
    billingAddress: str(job.billingAddress) || str(payload[P.billingAddress]),
    _recoveredAt: now,
    _recoveredFrom: `paylink:${found.code}`,
    _recoveredNote:
      `Invoice ${found.invoiceNo} was sent to the customer but its app record was lost. ` +
      `Re-materialized from the pay link, keeping the original number and pay reference.`,
    _savedAt: now,
  };
}

/**
 * Full plan: which invoices to restore and the patch for each.
 * @returns {{ plan: Array<{jobId:string, invoiceNo:string, patch:object}>, skipped: Array<object> }}
 */
export function planSentDocRecovery(payLinks = [], ov = {}, now = Date.now()) {
  const { missing, skipped } = findUnsavedSentInvoices(payLinks, ov);
  const plan = missing.map((found) => {
    const job = ov[found.jobId] || {};
    const raw = (payLinks.find((p) => str(p?.code) === found.code) || {}).record || null;
    return {
      jobId: found.jobId,
      invoiceNo: found.invoiceNo,
      customer: found.customer,
      amount: found.amount,
      patch: buildRecoveredInvoicePatch(found, job, raw, now),
    };
  });
  return { plan, skipped };
}
