// Map LE Pro job records → le-invoice-suite qb-pdf / email-template data shape.
import { parseAmount, todayStr } from "./format.js";
import { lineAmount, linesTotal } from "./qboDoc.js";
import { amountPaid, invoiceTotal, openBalance } from "./customers.js";
import { effectiveServiceAddress } from "./customerSync.js";
import { fmtInvoiceDate } from "./invoicePdf.js";
import { isChangeOrderJob } from "./changeOrder.js";
import { activeTenantConfig, tenantCompany } from "./tenantBranding.js";
import { formatPrintDescription } from "./printDescription.js";

/**
 * Header company block for the QBO template. Functions rather than consts:
 * tenant config resolves after import, so a captured value would freeze the seed.
 */
export function qbCompany() {
  const c = tenantCompany();
  return {
    name: c.name,
    // The QBO header has always rendered two spaces before the ZIP. Kept so
    // regenerating an existing invoice produces byte-identical output.
    addressLines: [c.street, c.cityStateZip.replace(/\s+(\d{5}(?:-\d{4})?)$/, "  $1")],
    phone: c.phone,
    email: c.email,
    /** Printed on its own line under the email (not next to the company name). */
    license: c.license,
  };
}

/**
 * Payment options block — gray message area. The Zelle line uses the tenant's
 * configured wording; the check line keeps this template's own two-line
 * phrasing (which differs from profile.checkInstructions) with the name and
 * mailbox swapped in, so existing invoices render unchanged.
 */
export function invoicePaymentLines() {
  const c = tenantCompany();
  const p = activeTenantConfig().profile || {};
  return [
    'Online Payment: Click the "View Invoice" tab in the email and pay',
    "via the provided credit card payment link.",
    `-${p.zelleInstructions}`,
    `-Check: Make checks payable to "${c.name}" and either: Mail`,
    `it or Email a clear picture of the check to ${c.email}.`,
  ];
}

export function invoiceClosingLines() {
  return [
    "Thank you for your business - we appreciate it very much.",
    "",
    "Sincerely,",
    tenantCompany().name,
  ];
}

/** Service address with apartment when present (e.g. "…, Apt 4B"). */
export function formatServiceAddressWithApt(job) {
  const addr = effectiveServiceAddress(job).trim();
  const apt = String(job?.apartment || "").trim();
  if (!addr) return "";
  if (!apt) return addr;
  const aptNorm = apt.replace(/^#/, "").trim();
  const already =
    new RegExp(`\\bapt\\.?\\s*#?\\s*${aptNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(addr) ||
    new RegExp(`\\b#\\s*${aptNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(addr);
  if (already) return addr;
  return `${addr}, Apt ${aptNorm}`;
}

function addDays(iso, days) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3] + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function syntheticAmountLine(job) {
  const amt = parseAmount(job?.amount);
  if (!(amt > 0)) return null;
  return {
    description: job.title || job.serviceType || "Electrical services",
    itemName: job.title || job.serviceType || "Electrical services",
    qty: 1,
    unitPrice: amt,
  };
}

function billableLines(job, kind) {
  const saved = (kind === "invoice" ? job.invoiceLines : job.estimateLines) || [];
  const filtered = saved.filter(
    (ln) =>
      ln &&
      (ln.description ||
        ln.itemName ||
        parseAmount(ln.unitPrice) ||
        parseAmount(ln.rate) ||
        parseAmount(ln.amount))
  );
  // Prefer lines that actually bill — empty/zero-qty staging lines must not
  // block the job.amount fallback (View Local PDF was failing on those jobs).
  const withMoney = filtered.filter((ln) => lineAmount(ln) > 0);
  if (withMoney.length) return withMoney;
  const synth = syntheticAmountLine(job);
  if (synth) return [synth];
  return filtered;
}

function mapLines(lines) {
  return lines.map((ln) => {
    // Product/Service (itemName) is backend-only — never print it.
    // Blank lines + bullet layout are preserved for the PDF.
    const desc = formatPrintDescription(ln.description);
    const qty =
      ln.qty != null && ln.qty !== "" ? parseAmount(ln.qty) : 1;
    let rate = parseAmount(ln.unitPrice) || parseAmount(ln.rate) || 0;
    const amount = lineAmount(ln);
    // Derive rate from amount when QBO only sent Amount
    if (!rate && amount && qty) rate = Math.round((amount / qty) * 100) / 100;
    return {
      description: desc,
      rate,
      qty: qty || 0,
      amount,
      serviceDate: ln.serviceDate || ln.date || "",
      progressLabel: ln.progressLabel || "",
    };
  });
}

/** Doc key for the docs blob store. */
export function docStoreKey(kind, no) {
  return (kind === "invoice" ? "inv-" : "est-") + String(no || "").trim();
}

/** Safe fragment for download filenames (customer or street). */
export function docPdfSlug(text, max = 40) {
  const s = String(text || "")
    .trim()
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return s.slice(0, max) || "";
}

/**
 * Customer-facing PDF filename — Invoice_251846_Customer_Name.pdf
 * Adds a short service-address slug when it differs from billing.
 */
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

/** True when the job has enough data to generate a local PDF.
 *  Invoice/estimate number is optional — drafts use "DRAFT" so Save-on-job
 *  can still download the QuickBooks-style PDF before QBO assigns a number. */
export function canGenerateLocalDoc(job, kind = "invoice") {
  const lines = billableLines(job, kind);
  const total = linesTotal(lines);
  if (lines.length > 0 && total > 0) return true;
  // Last resort: known invoice/estimate total even when line math is incomplete
  return parseAmount(job?.amount) > 0;
}

/** Map a job → le-invoice-suite generateDocument() input. */
export function mapJobToQbDocData(job, kind = "invoice") {
  const isInvoice = kind === "invoice";
  const docType = isInvoice ? "INVOICE" : "ESTIMATE";
  const docNumber =
    String(isInvoice ? job.invoiceNo : job.estimateNo || "").trim() || "DRAFT";
  const lines = mapLines(billableLines(job, kind));
  const subtotal = linesTotal(billableLines(job, kind));
  const tax = parseAmount(job.tax ?? 0);
  const discount = parseAmount(job.discount ?? 0);
  // Prefer line math minus discount; fall back to stored invoice total.
  const computed = Math.max(0, Math.round((subtotal + tax - discount) * 100) / 100);
  const total = computed || (isInvoice ? invoiceTotal(job) : subtotal) || subtotal;
  const paid = isInvoice ? amountPaid(job) : 0;
  // When discount changes the face total, balance due tracks the discounted total
  // unless payments / openBalance already encode a different remaining amount.
  const balanceDue = isInvoice
    ? (() => {
        const stored = openBalance(job);
        if (paid > 0 || (job.openBalance != null && job.openBalance !== "")) return stored;
        return Math.max(0, total - paid);
      })()
    : total;

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
  // Street only for the PDF — apartment prints as its own parallel field.
  const svcStreet = effectiveServiceAddress(job).trim();
  const apartment = String(job?.apartment || "")
    .trim()
    .replace(/^#/, "");
  const customFields = [];
  // Show when street differs from bill-to, or apartment is set (even if street matches).
  const billCmp = billAddr.toLowerCase();
  const hasApt = !!apartment;
  if (svcStreet && (svcStreet.toLowerCase() !== billCmp || hasApt)) {
    customFields.push({ label: "Service Address", value: svcStreet });
  }

  const firstServiceDate = lines.find((ln) => ln.serviceDate)?.serviceDate;

  // Change orders: dash + "Change Order" next to the invoice/estimate number.
  let displayDocNumber = docNumber;
  if (isChangeOrderJob(job) && !/change\s*order/i.test(displayDocNumber)) {
    displayDocNumber = `${displayDocNumber} - Change Order`;
  }

  return {
    docType,
    company: qbCompany(),
    docNumber: displayDocNumber,
    date: fmtInvoiceDate(invoiceDateRaw),
    dueDate: isInvoice ? fmtInvoiceDate(dueDateRaw) : undefined,
    billTo: {
      name: billName,
      addressLines: billAddr ? billAddr.split("\n").filter(Boolean) : [],
    },
    customFields,
    apartment: apartment || undefined,
    serviceDate: firstServiceDate ? fmtInvoiceDate(firstServiceDate) : fmtInvoiceDate(invoiceDateRaw),
    lines: lines.map(({ description, rate, qty, amount }) => ({ description, rate, qty, amount })),
    subtotal,
    tax,
    discount: discount > 0 ? discount : 0,
    total: total || subtotal,
    payment: paid > 0 ? paid : undefined,
    amountDue: isInvoice ? balanceDue : total,
    balanceDue: isInvoice ? balanceDue : undefined,
    // Payment options first, blank line, then thank-you / sincerely (same gray font).
    messageLines: isInvoice
      ? [...invoicePaymentLines(), "", ...invoiceClosingLines()]
      : undefined,
    // Estimates get a dedicated acceptance page (not piled under totals).
    showAcceptance: !isInvoice,
  };
}