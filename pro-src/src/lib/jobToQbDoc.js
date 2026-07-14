// Map LE Pro job records → le-invoice-suite qb-pdf / email-template data shape.
import { parseAmount, todayStr } from "./format.js";
import { lineAmount, linesTotal } from "./qboDoc.js";
import { amountPaid, invoiceTotal, openBalance } from "./customers.js";
import { effectiveServiceAddress } from "./customerSync.js";
import { fmtInvoiceDate } from "./invoicePdf.js";

export const QB_COMPANY = {
  name: "BLZ Electric Inc. Lic #11212",
  addressLines: ["383 Kingston Ave", "Brooklyn, NY  11213"],
  phone: "(718) 594-1850",
  email: "Office@LeElectrical.us",
};

function addDays(iso, days) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3] + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

function mapLines(lines) {
  return lines.map((ln) => {
    const desc = [ln.itemName, ln.description].filter(Boolean).join("\n").trim() || ln.itemName || "";
    const rate = parseAmount(ln.unitPrice);
    const qty = parseAmount(ln.qty) || 1;
    return {
      description: desc,
      rate,
      qty,
      amount: lineAmount(ln),
      serviceDate: ln.serviceDate || ln.date || "",
      progressLabel: ln.progressLabel || "",
    };
  });
}

/** Doc key for the docs blob store. */
export function docStoreKey(kind, no) {
  return (kind === "invoice" ? "inv-" : "est-") + String(no || "").trim();
}

/** True when the job has enough data to generate a local PDF. */
export function canGenerateLocalDoc(job, kind = "invoice") {
  const no = kind === "invoice" ? job?.invoiceNo : job?.estimateNo;
  if (!no) return false;
  const lines = billableLines(job, kind);
  const total = linesTotal(lines);
  return lines.length > 0 && total > 0;
}

/** Map a job → le-invoice-suite generateDocument() input. */
export function mapJobToQbDocData(job, kind = "invoice") {
  const isInvoice = kind === "invoice";
  const docType = isInvoice ? "INVOICE" : "ESTIMATE";
  const docNumber = String(isInvoice ? job.invoiceNo : job.estimateNo || "").trim();
  const lines = mapLines(billableLines(job, kind));
  const subtotal = linesTotal(billableLines(job, kind));
  const tax = parseAmount(job.tax ?? 0);
  const discount = parseAmount(job.discount ?? 0);
  const total = subtotal + tax - discount || (isInvoice ? invoiceTotal(job) : subtotal);
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
  const svcAddr = effectiveServiceAddress(job).trim();
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
      ? [
          "Thank you for your business - we appreciate it very much.",
          "",
          "Sincerely,",
          "BLZ Electric Inc.",
        ]
      : undefined,
    showAcceptance: !isInvoice,
  };
}