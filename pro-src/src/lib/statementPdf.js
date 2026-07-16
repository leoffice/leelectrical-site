// Customer statement PDF — 100% client-side (no server), same byte-writer
// pattern as invoicePdf.js. Lists a customer's invoices with charges / payments
// / running balance and a totals + simple aging summary.
import { parseAmount, todayStr } from "./format.js";
import { openBalance, invoiceTotal, amountPaid, clientKey, jobsForCustomerKey } from "./customers.js";
import { COMPANY, fmtInvoiceDate, fmtMoney, fmtBalance } from "./invoicePdf.js";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const RIGHT = PAGE_W - MARGIN;
const BODY = 10;
const SMALL = 9;
const TITLE = 20;

// Adobe AFM advance widths (/1000 em, ASCII 32..126) for right-alignment.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELVB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
function textWidth(str, size, bold) {
  const table = bold ? HELVB : HELV;
  let w = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    let code = s.charCodeAt(i);
    if (code < 32 || code > 126) code = 63;
    w += table[code - 32];
  }
  return (w / 1000) * size;
}
function esc(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
}
function textCmd(x, y, text, { size = BODY, font = "F1", align = "left" } = {}) {
  const t = esc(text);
  let tx = x;
  if (align === "right") tx = x - textWidth(text, size, font === "F2");
  else if (align === "center") tx = x - textWidth(text, size, font === "F2") / 2;
  tx = Math.round(tx * 100) / 100;
  return `BT /${font} ${size} Tf 1 0 0 1 ${tx} ${y} Tm (${t}) Tj ET`;
}
function line(x1, y1, x2, y2, w = 0.5) {
  return `${w} w ${x1} ${y1} m ${x2} ${y2} l S`;
}
/** Truncate to fit a pixel width (so a long description can't overrun the amount columns). */
function clip(str, maxWidth, size, bold = false) {
  let s = String(str || "");
  if (textWidth(s, size, bold) <= maxWidth) return s;
  while (s.length > 1 && textWidth(s + "…", size, bold) > maxWidth) s = s.slice(0, -1);
  return s + "…";
}

/** Customer name + open invoices from a job list (unit-testable). */
export function mapCustomerToStatementData(jobs, { customerKey, customerName, asOf } = {}) {
  const list = (jobs || []).filter((j) => j && j.invoiceNo);
  const name =
    customerName ||
    list[0]?.customer ||
    list[0]?.businessName ||
    list[0]?.personName ||
    "Customer";
  const billAddr = (list[0]?.billingAddress || list[0]?.address || "").trim();
  const rows = list
    .map((j) => {
      const charge = invoiceTotal(j);
      const paid = amountPaid(j);
      const balance = openBalance(j);
      const dateRaw = j.invoiceDate || j.status?.Invoiced?.d || j.status?.Invoice?.d || "";
      return {
        date: fmtInvoiceDate(dateRaw),
        _sort: String(dateRaw),
        invoiceNo: String(j.invoiceNo || "").trim(),
        description: (j.title || j.serviceType || "Electrical services").split("\n")[0].slice(0, 46),
        charge,
        paid,
        balance,
      };
    })
    .sort((a, b) => (a._sort < b._sort ? -1 : a._sort > b._sort ? 1 : 0));
  const totalCharge = rows.reduce((s, r) => s + r.charge, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
  return {
    customerName: name,
    billAddr,
    asOf: fmtInvoiceDate(asOf || todayStr()),
    rows,
    totalCharge: parseAmount(totalCharge),
    totalPaid: parseAmount(totalPaid),
    totalBalance: parseAmount(totalBalance),
    key: customerKey || "",
  };
}

function assemblePdf(streams) {
  const objs = [];
  const kids = [];
  objs.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  kids.push(...streams.map((_, i) => `${3 + i * 2} 0 R`));
  objs.push(`2 0 obj << /Type /Pages /Kids [${kids.join(" ")}] /Count ${streams.length} >> endobj\n`);
  const fontReg = 3 + streams.length * 2;
  const fontBold = fontReg + 1;
  streams.forEach((stream, i) => {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    objs.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> >> >> endobj\n`
    );
    objs.push(`${contentId} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`);
  });
  objs.push(`${fontReg} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n`);
  objs.push(`${fontBold} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n`);
  let pdf = "%PDF-1.4\n" + objs.join("");
  const xref = [];
  let offset = 0;
  const lines = pdf.split("\n");
  pdf = "";
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i] + (i < lines.length - 1 ? "\n" : "");
    const m = ln.match(/^(\d+) 0 obj/);
    if (m) xref[parseInt(m[1], 10)] = offset;
    offset += ln.length;
    pdf += ln;
  }
  const xrefStart = pdf.length;
  let table = "xref\n0 " + (fontBold + 1) + "\n0000000000 65535 f \n";
  for (let i = 1; i <= fontBold; i++) table += String(xref[i] || 0).padStart(10, "0") + " 00000 n \n";
  pdf += table;
  pdf += `trailer << /Size ${fontBold + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

function renderStatement(data) {
  const b = [];
  const txt = (x, y, t, o) => b.push(textCmd(x, y, t, o));
  let y = PAGE_H - MARGIN;

  // Header — company block + STATEMENT
  txt(MARGIN, y, COMPANY.name, { size: BODY });
  txt(RIGHT, y, "STATEMENT", { size: TITLE, font: "F2", align: "right" });
  y -= 13;
  txt(MARGIN, y, COMPANY.street);
  y -= 13;
  txt(MARGIN, y, COMPANY.cityStateZip);
  y -= 13;
  txt(MARGIN, y, COMPANY.phone);
  txt(RIGHT, y + 26, `Statement date: ${data.asOf}`, { size: SMALL, align: "right" });
  y -= 13;
  txt(MARGIN, y, COMPANY.email);
  y -= 30;

  // Bill to
  txt(MARGIN, y, "TO", { size: SMALL, font: "F2" });
  y -= 14;
  txt(MARGIN, y, data.customerName, { size: BODY });
  y -= 13;
  if (data.billAddr) {
    for (const ln of String(data.billAddr).split("\n")) {
      txt(MARGIN, y, ln.slice(0, 60), { size: SMALL });
      y -= 12;
    }
  }
  y -= 12;

  // Table header
  const cDate = MARGIN;
  const cInv = MARGIN + 70;
  const cDesc = MARGIN + 130;
  const cCharge = RIGHT - 210;
  const cPaid = RIGHT - 110;
  const cBal = RIGHT;
  txt(cDate, y, "DATE", { size: SMALL, font: "F2" });
  txt(cInv, y, "INVOICE", { size: SMALL, font: "F2" });
  txt(cDesc, y, "DESCRIPTION", { size: SMALL, font: "F2" });
  txt(cCharge, y, "CHARGES", { size: SMALL, font: "F2", align: "right" });
  txt(cPaid, y, "PAYMENTS", { size: SMALL, font: "F2", align: "right" });
  txt(cBal, y, "BALANCE", { size: SMALL, font: "F2", align: "right" });
  y -= 6;
  b.push(line(MARGIN, y, RIGHT, y, 0.6));
  y -= 14;

  // Rows with running balance
  let running = 0;
  for (const r of data.rows) {
    running += r.balance;
    txt(cDate, y, r.date || "-", { size: SMALL });
    txt(cInv, y, r.invoiceNo, { size: SMALL });
    // Keep the description inside its column — stop before the CHARGES amount.
    txt(cDesc, y, clip(r.description, cCharge - 46 - cDesc, SMALL), { size: SMALL });
    txt(cCharge, y, fmtMoney(r.charge), { size: SMALL, align: "right" });
    txt(cPaid, y, r.paid ? fmtMoney(r.paid) : "-", { size: SMALL, align: "right" });
    txt(cBal, y, fmtMoney(r.balance), { size: SMALL, align: "right" });
    y -= 15;
    if (y < MARGIN + 140) break; // single-page statement guard
  }
  y -= 4;
  b.push(line(MARGIN, y, RIGHT, y, 0.6));
  y -= 18;

  // Totals
  const lblX = RIGHT - 210;
  txt(lblX, y, "Total charges", { size: SMALL, font: "F2" });
  txt(cBal, y, fmtMoney(data.totalCharge), { size: SMALL, align: "right" });
  y -= 14;
  txt(lblX, y, "Total payments", { size: SMALL, font: "F2" });
  txt(cBal, y, fmtMoney(data.totalPaid), { size: SMALL, align: "right" });
  y -= 16;
  txt(lblX, y, "BALANCE DUE", { size: BODY, font: "F2" });
  txt(cBal, y, fmtBalance(data.totalBalance), { size: BODY, font: "F2", align: "right" });
  y -= 34;

  txt(MARGIN, y, "Please remit the balance due. Thank you for your business!", { size: SMALL });
  y -= 12;
  txt(MARGIN, y, `Questions? ${COMPANY.phone}  ${COMPANY.email}`, { size: SMALL });

  // Page number
  b.push(textCmd(RIGHT - 60, MARGIN - 10, "Page 1 of 1", { size: SMALL }));
  return b.join("\n");
}

/** @returns {Blob} application/pdf — customer statement. */
export function buildStatementPdf(data) {
  return new Blob([new TextEncoder().encode(assemblePdf([renderStatement(data)]))], { type: "application/pdf" });
}

/** Convenience: all jobs + a customer → statement Blob (client-side, no fetch). */
export function buildStatementPdfForCustomer(jobs, { customerKey, customerName, asOf } = {}) {
  const key = customerKey || (jobs && jobs[0] ? clientKey(jobs[0]) : "");
  const custJobs = customerKey ? jobsForCustomerKey(jobs, customerKey) : jobs;
  const data = mapCustomerToStatementData(custJobs, { customerKey: key, customerName, asOf });
  return buildStatementPdf(data);
}
