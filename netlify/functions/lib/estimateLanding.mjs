// Shared helpers for public estimate landing actions (approve + 50% deposit invoice).

export const COMMANDS_KEY = "commands-v1";
export const JOBS_KEY = "jobsdata-v1";
export const STATE_KEY = "jobstate-v1";
export const CODE_RE = /^[0-9]{5,8}-[a-z0-9]{4}$/i;

export function parseMoney(raw) {
  const n = parseFloat(String(raw ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "$0.00";
  return (
    "$" +
    v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** QBO-style progress lines: keep full rate, scale qty by deposit %. */
export function progressBillLines(lines, progressPct = 50) {
  const pct = Math.min(100, Math.max(0, parseMoney(progressPct))) / 100;
  return (lines || []).map((ln) => {
    const baseQty = parseMoney(ln.qty) || 1;
    const rate = parseMoney(ln.unitPrice || ln.rate) || 0;
    const qty = pct >= 1 ? baseQty : Math.round(baseQty * pct * 1e7) / 1e7;
    return {
      itemName: String(ln.itemName || "").trim(),
      itemId: String(ln.itemId || "").trim(),
      description: String(ln.description || ln.itemName || "").trim(),
      qty,
      unitPrice: rate,
      amount: Math.round(qty * rate * 100) / 100,
      progressBilling: pct < 1,
    };
  });
}

export function linesTotal(lines) {
  return (lines || []).reduce((s, ln) => {
    const a = parseMoney(ln.amount);
    if (a) return s + a;
    return s + Math.round((parseMoney(ln.qty) || 1) * (parseMoney(ln.unitPrice) || 0) * 100) / 100;
  }, 0);
}

export function isEstimatePayload(payload) {
  if (!payload) return false;
  if (payload.k === "e" || payload.kind === "estimate") return true;
  // Landing minted for estimate always has lines + no pay URL when k missing
  // (legacy). Prefer explicit k.
  return false;
}

export function depositInvoiceNo(estimateNo) {
  const est = String(estimateNo || "").trim().replace(/[^\w.-]/g, "");
  if (!est) return `DEP-${Date.now().toString().slice(-8)}`;
  return `D-${est}`;
}

/** Build a job-shaped object for deposit invoice email / QBO create. */
export function buildDepositJobFromPayload(payload, { depositPct = 50, invoiceNo = "" } = {}) {
  const pct = parseMoney(depositPct) || 50;
  const estNo = String(payload.en || payload.i || "").trim();
  const invNo = String(invoiceNo || depositInvoiceNo(estNo)).trim();
  const lines = progressBillLines(payload.lines || [], pct);
  const total = linesTotal(lines);
  return {
    id: String(payload.j || "").trim(),
    customer: String(payload.c || "").trim(),
    businessName: String(payload.businessName || payload.c || "").trim(),
    personName: String(payload.personName || "").trim(),
    qboCustomerId: String(payload.qboCustomerId || "").trim(),
    email: String(payload.e || "").trim(),
    phone: String(payload.ph || "").trim(),
    title: String(payload.w || "Electrical services").trim(),
    serviceAddress: String(payload.sa || "").trim(),
    billingAddress: String(payload.ba || payload.sa || "").trim(),
    address: String(payload.sa || payload.ba || "").trim(),
    apartment: String(payload.apartment || "").trim(),
    zip: String(payload.z || "").trim(),
    estimateNo: estNo,
    invoiceNo: invNo,
    estimateLines: payload.lines || [],
    invoiceLines: lines,
    amount: total,
    openBalance: total,
    contractAmount: parseMoney(payload.a) || linesTotal(payload.lines || []),
    payments: [],
    status: {
      Estimate: { s: "done", d: todayISO() },
      Accepted: { s: "done", d: todayISO() },
      Invoiced: { s: "done", d: todayISO() },
    },
    invoiceProgressBilling: pct < 99.99,
    depositPct: pct,
    source: "estimate_landing_deposit",
  };
}

export function createInvoicePayloadFromJob(job, { progressPct = 50 } = {}) {
  const lines = (job.invoiceLines || []).map((ln) => ({
    itemName: ln.itemName || "",
    itemId: ln.itemId || "",
    description: ln.description || "",
    qty: parseMoney(ln.qty) || 1,
    unitPrice: parseMoney(ln.unitPrice) || 0,
    amount: parseMoney(ln.amount) || Math.round((parseMoney(ln.qty) || 1) * (parseMoney(ln.unitPrice) || 0) * 100) / 100,
  }));
  const total = linesTotal(lines);
  return {
    customer: job.customer || job.businessName || "",
    businessName: job.businessName || job.customer || "",
    qboCustomerId: job.qboCustomerId || "",
    email: job.email || "",
    personName: job.personName || "",
    jobTitle: job.title || "",
    serviceAddress: job.serviceAddress || job.address || "",
    apartment: job.apartment || "",
    shipAddr: {
      Line1: String(job.serviceAddress || job.address || "").trim(),
      ...(job.apartment ? { Line2: String(job.apartment).trim() } : {}),
    },
    lines,
    total,
    totalFormatted: money(total),
    invoiceNo: job.invoiceNo || "",
    estimateNo: job.estimateNo || "",
    source: "estimate",
    progressPct: parseMoney(progressPct) || 50,
    progressBilling: true,
    send: false,
    attachments: [],
  };
}
