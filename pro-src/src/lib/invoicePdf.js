// Local invoice PDF generation — matches BLZ Electric QBO invoice layout (no deps).
import { parseAmount, todayStr } from "./format.js";
import { lineAmount, linesTotal } from "./qboDoc.js";
import { amountPaid, invoiceTotal, openBalance } from "./customers.js";
import { effectiveServiceAddress } from "./customerSync.js";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const RIGHT = PAGE_W - MARGIN;
const BODY = 10;
const SMALL = 9;
const HEAD = 14;
const TITLE = 20;

export const COMPANY = {
  name: "BLZ Electric Inc. Lic #11212",
  street: "383 Kingston Ave",
  cityStateZip: "Brooklyn, NY 11213",
  phone: "(718) 594-1850",
  email: "Office@LeElectrical.us",
};

export const PAYMENT_INSTRUCTIONS = [
  "To make a payment, please follow one of these options:",
  "",
  'Online Payment: Click the "View Invoice" tab in the email and pay',
  "via the provided credit card payment link.",
  "-Zelle: Send payment to Office@LeElectrical.us.",
  '-Check: Make checks payable to "BLZ Electric Inc." and either: Mail',
  "it or Email a clear picture of the check to Office@LeElectrical.us.",
];

const FOOTER_LINES = [
  "Thank you for your business!",
  "If you have any questions concerning this invoice please contact us.",
  `Phone: ${COMPANY.phone} Email: office@LeElectrical.us`,
];

function esc(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
}

/** MM/DD/YYYY — QBO invoice date style. */
export function fmtInvoiceDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[1].padStart(2, "0")}/${us[2].padStart(2, "0")}/${us[3]}`;
  return s;
}

/** 2,300.00 — QBO amount column style. */
export function fmtMoney(n) {
  const v = parseAmount(n);
  const neg = v < 0;
  const abs = Math.abs(v);
  const parts = abs.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + parts.join(".");
}

/** $0.00 — balance due line. */
export function fmtBalance(n) {
  const v = parseAmount(n);
  return "$" + fmtMoney(v);
}

function addDays(iso, days) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3] + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function wrapParagraph(para, max = 52) {
  const words = String(para || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const out = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

function wrapBlock(text, max = 52) {
  const lines = [];
  for (const para of String(text || "").split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    lines.push(...wrapParagraph(para, max));
  }
  return lines.length ? lines : [""];
}

function textCmd(x, y, text, { size = BODY, font = "F1", align = "left", width } = {}) {
  const t = esc(text);
  if (align === "right" && width != null) {
    return `BT /${font} ${size} Tf ${width} 0 0 ${size} ${x} ${y} Tm (${t}) Tj ET`;
  }
  return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${t}) Tj ET`;
}

function moneyCol(x, y, n, size = BODY) {
  return textCmd(x, y, fmtMoney(n), { size, align: "right", width: 0 });
}

/** Map a job record into invoice PDF fields (unit-testable). */
export function mapJobToInvoicePdfData(job, overrides = {}) {
  const j = job || {};
  const saved = (j.invoiceLines || []).filter((ln) => ln && (ln.description || ln.itemName || parseAmount(ln.unitPrice)));
  const lines =
    saved.length > 0
      ? saved
      : parseAmount(j.amount) > 0
      ? [{ description: j.title || j.serviceType || "Electrical services", qty: 1, unitPrice: parseAmount(j.amount) }]
      : [];

  const subtotal = overrides.subtotal != null ? parseAmount(overrides.subtotal) : linesTotal(lines);
  const tax = parseAmount(overrides.tax ?? j.tax ?? 0);
  const discount = parseAmount(overrides.discount ?? j.discount ?? 0);
  const total = overrides.total != null ? parseAmount(overrides.total) : subtotal + tax - discount;
  const paid = overrides.paid != null ? parseAmount(overrides.paid) : amountPaid(j);
  const balanceDue = overrides.balanceDue != null ? parseAmount(overrides.balanceDue) : openBalance(j);

  const invoiceDateRaw = overrides.invoiceDate || j.invoiceDate || j.status?.Invoiced?.d || j.status?.Invoice?.d || todayStr();
  const dueDateRaw = overrides.dueDate || j.dueDate || addDays(invoiceDateRaw, 1);

  const billName = (j.customer || j.businessName || j.personName || "").trim();
  const billAddr = (j.billingAddress || j.address || "").trim();
  const svcAddr = effectiveServiceAddress(j).trim();
  const showService = svcAddr && billAddr && svcAddr.toLowerCase() !== billAddr.toLowerCase();

  return {
    invoiceNo: String(overrides.invoiceNo || j.invoiceNo || "").trim(),
    invoiceDate: fmtInvoiceDate(invoiceDateRaw),
    dueDate: fmtInvoiceDate(dueDateRaw),
    billTo: { name: billName, address: billAddr },
    serviceAddress: showService ? svcAddr : "",
    lines: lines.map((ln) => ({
      serviceDate: fmtInvoiceDate(ln.serviceDate || ln.date || ""),
      description: [ln.itemName, ln.description].filter(Boolean).join("\n").trim() || ln.itemName || "",
      rate: parseAmount(ln.unitPrice),
      qty: parseAmount(ln.qty) || 1,
      amount: lineAmount(ln),
      progressLabel: ln.progressLabel || "",
    })),
    subtotal,
    tax,
    discount,
    total: total || invoiceTotal(j) || subtotal,
    paid,
    balanceDue,
    showPayment: paid > 0 || parseAmount(balanceDue) >= 0,
  };
}

/** True when the job has enough data to render a local invoice PDF. */
export function canGenerateLocalInvoice(job) {
  if (!job?.invoiceNo) return false;
  const mapped = mapJobToInvoicePdfData(job);
  return mapped.lines.length > 0 && mapped.total > 0;
}

function buildPageStream(blocks) {
  return blocks.filter(Boolean).join("\n");
}

function renderInvoicePages(data) {
  const pages = [];
  let pageBlocks = [];
  let y = PAGE_H - MARGIN;

  const flushPage = () => {
    if (!pageBlocks.length) return;
    pages.push(buildPageStream(pageBlocks));
    pageBlocks = [];
    y = PAGE_H - MARGIN;
  };

  const needPage = (lines = 1) => {
    if (y - lines * 13 < MARGIN + 80) flushPage();
  };

  const add = (block) => {
    pageBlocks.push(block);
  };

  const addText = (x, yy, text, opts = {}) => add(textCmd(x, yy, text, opts));

  // --- Page 1 header (company + INVOICE block) ---
  addText(MARGIN, y, COMPANY.name, { size: BODY, font: "F1" });
  y -= 13;
  addText(MARGIN, y, COMPANY.street);
  y -= 13;
  addText(MARGIN, y, COMPANY.cityStateZip);
  y -= 13;
  addText(MARGIN, y, COMPANY.phone);
  y -= 13;
  addText(MARGIN, y, COMPANY.email);
  y -= 28;

  addText(RIGHT - 120, PAGE_H - MARGIN - 10, "INVOICE", { size: TITLE, font: "F2" });
  addText(RIGHT - 120, PAGE_H - MARGIN - 36, "INVOICE", { size: SMALL, font: "F2" });
  addText(RIGHT - 50, PAGE_H - MARGIN - 36, data.invoiceNo, { size: BODY });
  addText(RIGHT - 120, PAGE_H - MARGIN - 52, "DATE", { size: SMALL, font: "F2" });
  addText(RIGHT - 50, PAGE_H - MARGIN - 52, data.invoiceDate, { size: BODY });
  addText(RIGHT - 120, PAGE_H - MARGIN - 68, "DUE DATE", { size: SMALL, font: "F2" });
  addText(RIGHT - 50, PAGE_H - MARGIN - 68, data.dueDate, { size: BODY });

  addText(MARGIN, y, "BILL TO", { size: SMALL, font: "F2" });
  y -= 14;
  if (data.billTo.name) {
    addText(MARGIN, y, data.billTo.name);
    y -= 13;
  }
  for (const ln of wrapBlock(data.billTo.address, 40)) {
    needPage();
    addText(MARGIN, y, ln);
    y -= 13;
  }
  y -= 8;

  if (data.serviceAddress) {
    needPage(2);
    addText(MARGIN, y, "SERVICE ADDRESS", { size: SMALL, font: "F2" });
    y -= 14;
    for (const ln of wrapBlock(data.serviceAddress, 40)) {
      needPage();
      addText(MARGIN, y, ln);
      y -= 13;
    }
    y -= 8;
  }

  // Table header
  needPage(3);
  const colDesc = MARGIN;
  const colRate = RIGHT - 200;
  const colQty = RIGHT - 130;
  const colAmt = RIGHT - 55;
  addText(colDesc, y, "DESCRIPTION", { size: SMALL, font: "F2" });
  addText(colRate, y, "RATE", { size: SMALL, font: "F2" });
  addText(colQty, y, "QTY", { size: SMALL, font: "F2" });
  addText(colAmt, y, "AMOUNT", { size: SMALL, font: "F2" });
  y -= 16;
  add(`0.5 ${MARGIN} ${y} m ${RIGHT - MARGIN} ${y} l S`);
  y -= 14;

  for (const ln of data.lines) {
    needPage(4);
    if (ln.serviceDate) {
      addText(colDesc, y, ln.serviceDate, { size: SMALL });
      y -= 12;
    }
    if (ln.progressLabel) {
      addText(colDesc, y, ln.progressLabel, { size: SMALL });
      y -= 12;
    }
    const descLines = wrapBlock(ln.description, 48);
    const rowH = Math.max(descLines.length, 1) * 12 + 8;
    needPage(Math.ceil(rowH / 12));
    let dy = y;
    for (const dl of descLines) {
      addText(colDesc, dy, dl);
      dy -= 12;
    }
    add(moneyCol(colRate, y, ln.rate));
    addText(colQty, y, String(ln.qty));
    add(moneyCol(colAmt, y, ln.amount));
    y -= rowH;
  }

  y -= 10;
  needPage(12);

  // Payment instructions + totals (QBO places these after line items)
  for (const ln of PAYMENT_INSTRUCTIONS) {
    needPage();
    addText(MARGIN, y, ln, { size: SMALL });
    y -= 11;
  }
  y -= 6;

  const totalsX = RIGHT - 180;
  const totalsVal = RIGHT - 55;
  const totalRows = [
    ["SUBTOTAL", data.subtotal],
    data.discount ? ["DISCOUNT", -data.discount] : null,
    ["TAX", data.tax],
    ["TOTAL", data.total],
    data.paid > 0 ? ["PAYMENT", data.paid] : null,
    ["BALANCE DUE", data.balanceDue],
  ].filter(Boolean);

  for (const [label, val] of totalRows) {
    needPage();
    addText(totalsX, y, label, { size: SMALL, font: "F2" });
    if (label === "BALANCE DUE") addText(totalsVal, y, fmtBalance(val), { size: BODY, font: "F2" });
    else add(moneyCol(totalsVal, y, val));
    y -= 14;
  }

  y -= 10;
  for (const ln of FOOTER_LINES) {
    needPage();
    addText(MARGIN, y, ln, { size: SMALL });
    y -= 11;
  }

  flushPage();

  // Page numbers on each page
  return pages.map((stream, i) => {
    const pageNum = `Page ${i + 1} of ${pages.length}`;
    return stream + "\n" + textCmd(RIGHT - 80, MARGIN - 10, pageNum, { size: SMALL });
  });
}

function assemblePdf(pageStreams) {
  const objs = [];
  const kids = [];
  objs.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  kids.push(...pageStreams.map((_, i) => `${3 + i * 2} 0 R`));
  objs.push(`2 0 obj << /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageStreams.length} >> endobj\n`);

  const fontReg = 3 + pageStreams.length * 2;
  const fontBold = fontReg + 1;
  pageStreams.forEach((stream, i) => {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    const bytes = stream.length;
    objs.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> >> >> endobj\n`
    );
    objs.push(`${contentId} 0 obj << /Length ${bytes} >> stream\n${stream}\nendstream\nendobj\n`);
  });

  objs.push(`${fontReg} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n`);
  objs.push(`${fontBold} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n`);

  let pdf = "%PDF-1.4\n" + objs.join("");
  const xref = [];
  let offset = 0;
  const lines = pdf.split("\n");
  pdf = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] + (i < lines.length - 1 ? "\n" : "");
    const m = line.match(/^(\d+) 0 obj/);
    if (m) xref[parseInt(m[1], 10)] = offset;
    offset += line.length;
    pdf += line;
  }

  const xrefStart = pdf.length;
  let xrefTable = "xref\n0 " + (fontBold + 1) + "\n0000000000 65535 f \n";
  for (let i = 1; i <= fontBold; i++) {
    xrefTable += String(xref[i] || 0).padStart(10, "0") + " 00000 n \n";
  }
  pdf += xrefTable;
  pdf += `trailer << /Size ${fontBold + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

/** @returns {Blob} application/pdf */
export function buildInvoicePdf(data) {
  const pages = renderInvoicePages(data);
  return new Blob([assemblePdf(pages)], { type: "application/pdf" });
}

/** Convenience: job → Blob. */
export function buildInvoicePdfFromJob(job, overrides = {}) {
  return buildInvoicePdf(mapJobToInvoicePdfData(job, overrides));
}