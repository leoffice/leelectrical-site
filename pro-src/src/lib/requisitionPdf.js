// AIA G702 / G703 requisition PDF — lightweight, no deps (matches invoicePdf pattern).

import { fmtUsd } from "./requisitionData.js";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const RIGHT = PAGE_W - MARGIN;
const BODY = 9;
const SMALL = 8;
const HEAD = 12;

function esc(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
}

function textCmd(x, y, text, { size = BODY, font = "F1", align = "left", width } = {}) {
  const t = esc(text);
  if (align === "right" && width != null) {
    return `BT /${font} ${size} Tf ${width} 0 0 ${size} ${x} ${y} Tm (${t}) Tj ET`;
  }
  return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${t}) Tj ET`;
}

function money(x, y, n) {
  return textCmd(x, y, fmtUsd(n).replace("$", ""), { align: "right", width: 0 });
}

function assemblePdf(pages) {
  const objs = [];
  objs.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objs.push(`2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pages.length} >> endobj\n`);
  const fontReg = 3 + pages.length * 2;
  const fontBold = fontReg + 1;

  pages.forEach((stream, i) => {
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

function renderG702Page(project, req) {
  const blocks = [];
  let y = PAGE_H - MARGIN;
  const add = (b) => blocks.push(b);
  const txt = (x, yy, t, o = {}) => add(textCmd(x, yy, t, o));

  txt(MARGIN, y, "APPLICATION AND CERTIFICATE FOR PAYMENT", { size: HEAD, font: "F2" });
  y -= 24;
  txt(MARGIN, y, "AIA Document G702", { size: SMALL });
  y -= 20;

  txt(MARGIN, y, `Application No: ${req.applicationNumber || "REQ-" + req.num}`, { font: "F2" });
  txt(RIGHT - 120, y, `Period to: ${req.periodTo || ""}`);
  y -= 16;
  txt(MARGIN, y, `Project: ${project.name || ""}`);
  y -= 13;
  txt(MARGIN, y, `Location: ${project.address || ""}`);
  y -= 13;
  txt(MARGIN, y, `Contractor: ${project.contractor || "Martin Dorkin"}`);
  y -= 13;
  txt(MARGIN, y, `To: ${project.gc || ""}`);
  y -= 24;

  const rows = [
    ["1. ORIGINAL CONTRACT SUM", req.contractSumToDate ? project.contractSum : req.contractSumToDate],
    ["2. NET CHANGE BY CHANGE ORDERS", project.changeOrders || 0],
    ["3. CONTRACT SUM TO DATE", req.contractSumToDate],
    ["4. TOTAL COMPLETED & STORED", req.totalCompleted],
    [`5. RETAINAGE (${req.retainagePct || 10}%)`, req.totalRetainage],
    ["6. TOTAL EARNED LESS RETAINAGE", req.earnedLessRetainage],
    ["7. LESS PREVIOUS CERTIFICATES", req.previousCertificates],
    ["8. CURRENT PAYMENT DUE", req.currentPaymentDue],
    ["9. BALANCE TO FINISH", req.balanceToFinish],
  ];

  for (const [label, val] of rows) {
    txt(MARGIN, y, label, { size: SMALL });
    add(money(RIGHT - 80, y, val));
    y -= 14;
  }

  y -= 20;
  txt(MARGIN, y, "CONTRACTOR'S APPLICATION FOR PAYMENT", { font: "F2", size: SMALL });
  y -= 14;
  txt(MARGIN, y, "The undersigned Contractor certifies that to the best of the", { size: SMALL });
  y -= 11;
  txt(MARGIN, y, "Contractor's knowledge, information and belief the Work covered by", { size: SMALL });
  y -= 11;
  txt(MARGIN, y, "this Application for Payment has been completed in accordance with", { size: SMALL });
  y -= 11;
  txt(MARGIN, y, "the Contract Documents.", { size: SMALL });

  return blocks.join("\n");
}

function renderG703Page(project, req) {
  const blocks = [];
  let y = PAGE_H - MARGIN;
  const add = (b) => blocks.push(b);
  const txt = (x, yy, t, o = {}) => add(textCmd(x, yy, t, o));

  txt(MARGIN, y, "CONTINUATION SHEET", { size: HEAD, font: "F2" });
  y -= 16;
  txt(MARGIN, y, `AIA Document G703 — ${req.applicationNumber || ""}`, { size: SMALL });
  y -= 20;

  const cols = [MARGIN, MARGIN + 22, MARGIN + 200, MARGIN + 280, MARGIN + 340, MARGIN + 400, MARGIN + 460, RIGHT - 40];
  const headers = ["#", "Description", "Scheduled", "Prev", "This", "Total", "Bal", "%"];
  headers.forEach((h, i) => txt(cols[i], y, h, { size: SMALL, font: "F2" }));
  y -= 14;

  const rows = req.g703 || [];
  for (const r of rows) {
    if (y < MARGIN + 40) break;
    txt(cols[0], y, String(r.itemNo), { size: SMALL });
    const desc = String(r.description || "").slice(0, 42);
    txt(cols[1], y, desc, { size: SMALL });
    add(money(cols[2], y, r.scheduledValue));
    add(money(cols[3], y, r.prevCompleted));
    add(money(cols[4], y, r.thisPeriod));
    add(money(cols[5], y, r.totalCompleted));
    add(money(cols[6], y, r.balance));
    txt(cols[7], y, `${r.pctComplete || 0}%`, { size: SMALL });
    y -= 12;
  }

  return blocks.join("\n");
}

/** @returns {Blob} application/pdf */
export function buildRequisitionPdf(project, requisition) {
  const g702 = renderG702Page(project, requisition);
  const g703 = renderG703Page(project, requisition);
  return new Blob([assemblePdf([g702, g703])], { type: "application/pdf" });
}

export function downloadRequisitionPdf(project, requisition) {
  const blob = buildRequisitionPdf(project, requisition);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${requisition.applicationNumber || "requisition"}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}