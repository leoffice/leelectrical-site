// Server copy — mirrors pro-src/src/lib/jobToQbDoc.js (keep in sync).

export const QB_COMPANY = {
  name: "BLZ Electric Inc. Lic #11212",
  addressLines: ["383 Kingston Ave", "Brooklyn, NY  11213"],
  phone: "(718) 594-1850",
  email: "Office@LeElectrical.us",
};

function parseAmount(v) {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function fmtInvoiceDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[1].padStart(2, "0")}/${us[2].padStart(2, "0")}/${us[3]}`;
  return s;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso, days) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3] + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lineAmount(ln) {
  const q = parseAmount(ln.qty) || 0;
  const p = parseAmount(ln.unitPrice) || 0;
  return Math.round(q * p * 100) / 100;
}

function linesTotal(lines) {
  return (lines || []).reduce((s, ln) => s + lineAmount(ln), 0);
}

function effectiveServiceAddress(job) {
  return (job?.serviceAddress || job?.address || "").trim();
}

function amountPaid(job) {
  const pays = job?.payments;
  if (Array.isArray(pays) && pays.length) {
    return pays.reduce((s, p) => s + parseAmount(p?.amount), 0);
  }
  return parseAmount(job?.paid);
}

function openBalance(job) {
  const total = parseAmount(job?.amount) || linesTotal(job?.invoiceLines || []);
  const paid = amountPaid(job);
  if (job?.openBalance != null && job.openBalance !== "") return parseAmount(job.openBalance);
  return Math.max(0, total - paid);
}

function billableLines(job, kind) {
  const saved = (kind === "invoice" ? job.invoiceLines : job.estimateLines) || [];
  const filtered = saved.filter(
    (ln) => ln && (ln.description || ln.itemName || parseAmount(ln.unitPrice))
  );
  if (filtered.length) return filtered;
  if (parseAmount(job.amount) > 0) {
    return [
      {
        description: job.title || job.serviceType || "Electrical services",
        itemName: job.title || job.serviceType || "Electrical services",
        qty: 1,
        unitPrice: parseAmount(job.amount),
      },
    ];
  }
  return [];
}

export function docStoreKey(kind, no) {
  return (kind === "invoice" ? "inv-" : "est-") + String(no || "").trim();
}

export function docPdfSlug(text, max = 40) {
  const s = String(text || "")
    .trim()
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return s.slice(0, max) || "";
}

export function docPdfFilename(kind, job = {}, docNumber = "") {
  const isInvoice = kind === "invoice";
  const word = isInvoice ? "Invoice" : "Estimate";
  const no = String(docNumber || (isInvoice ? job.invoiceNo : job.estimateNo) || "").trim();
  const customer = docPdfSlug(job.customer || job.businessName || job.personName || "");
  const svc = String(job.serviceAddress || job.address || "").trim();
  const bill = String(job.billingAddress || job.address || "").trim();
  const addrSlug =
    svc && bill && svc.toLowerCase() !== bill.toLowerCase()
      ? docPdfSlug(svc.split("\n")[0].split(",")[0], 28)
      : "";
  const parts = [word, no, customer || "Customer", addrSlug].filter(Boolean);
  return parts.join("_") + ".pdf";
}

export function canGenerateLocalDoc(job, kind = "invoice") {
  const no = kind === "invoice" ? job?.invoiceNo : job?.estimateNo;
  if (!no) return false;
  const lines = billableLines(job, kind);
  return lines.length > 0 && linesTotal(lines) > 0;
}

export function mapJobToQbDocData(job, kind = "invoice") {
  const isInvoice = kind === "invoice";
  const docType = isInvoice ? "INVOICE" : "ESTIMATE";
  const docNumber = String(isInvoice ? job.invoiceNo : job.estimateNo || "").trim();
  const rawLines = billableLines(job, kind);
  const lines = rawLines.map((ln) => {
    const desc = [ln.itemName, ln.description].filter(Boolean).join("\n").trim() || ln.itemName || "";
    const rate = parseAmount(ln.unitPrice);
    const qty = parseAmount(ln.qty) || 1;
    return { description: desc, rate, qty, amount: lineAmount(ln), serviceDate: ln.serviceDate || ln.date || "" };
  });
  const subtotal = linesTotal(rawLines);
  const tax = parseAmount(job.tax ?? 0);
  const total = subtotal + tax;
  const paid = isInvoice ? amountPaid(job) : 0;
  const balanceDue = isInvoice ? openBalance(job) : total;

  const invoiceDateRaw =
    job.invoiceDate ||
    job.estimateDate ||
    job.status?.Invoiced?.d ||
    job.status?.Invoice?.d ||
    job.status?.Estimate?.d ||
    todayStr();
  const dueDateRaw = job.dueDate || (isInvoice ? addDays(invoiceDateRaw, 1) : "");

  const billName = (job.customer || job.businessName || job.personName || "").trim();
  const billAddr = (job.billingAddress || job.address || "").trim();
  const svcAddr = effectiveServiceAddress(job);
  const customFields = [];
  if (svcAddr && billAddr && svcAddr.toLowerCase() !== billAddr.toLowerCase()) {
    customFields.push({ label: "Service Address", value: svcAddr });
  }

  const firstServiceDate = lines.find((ln) => ln.serviceDate)?.serviceDate;

  return {
    docType,
    company: QB_COMPANY,
    docNumber,
    date: fmtInvoiceDate(invoiceDateRaw),
    dueDate: isInvoice ? fmtInvoiceDate(dueDateRaw) : undefined,
    billTo: {
      name: billName,
      addressLines: billAddr ? billAddr.split("\n").filter(Boolean) : [],
    },
    customFields,
    serviceDate: firstServiceDate ? fmtInvoiceDate(firstServiceDate) : fmtInvoiceDate(invoiceDateRaw),
    lines: lines.map(({ description, rate, qty, amount }) => ({ description, rate, qty, amount })),
    subtotal,
    tax,
    total: total || subtotal,
    payment: paid > 0 ? paid : undefined,
    amountDue: isInvoice ? balanceDue : total,
    balanceDue: isInvoice ? balanceDue : undefined,
    messageLines: isInvoice
      ? ["Thank you for your business - we appreciate it very much.", "", "Sincerely,", "BLZ Electric Inc."]
      : undefined,
    showAcceptance: !isInvoice,
  };
}