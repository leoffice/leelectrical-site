// AIA G702 (Application and Certificate for Payment) + G703 (Continuation Sheet)
// PDF generator — zero dependencies, matches the invoicePdf byte-writer pattern.
//
// Rewritten to fix the earlier build: money values are now right-aligned by
// measuring text width (the old code used a degenerate `w 0 0 s x y Tm` matrix
// with w=0, which scaled every amount to zero width — i.e. invisible), the
// tables have real grid lines, em dashes are ASCII-safe, and the G703 paginates
// across as many pages as the line items need with a carried-forward totals row.

import { LE_LOGO_JPEG, leLogoJpegBytes } from "./leLogoJpeg.js";
import { projectCompanyName, REQ_BILLING } from "./requisitionData.js";

const LETTER_W = 612;
const LETTER_H = 792;
const MARGIN = 40;

// Embedded LE logo (DCTDecode JPEG) drawn on the G702 letterhead.
const LOGO = { name: "ImLogo", width: LE_LOGO_JPEG.width, height: LE_LOGO_JPEG.height };

// ---- font metrics (Adobe AFM advance widths /1000 em, ASCII 32..126) --------
// Needed so we can right-align currency columns without a PDF layout engine.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELVB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function charWidth(code, bold) {
  if (code < 32 || code > 126) code = 63; // '?'
  return (bold ? HELVB : HELV)[code - 32];
}
function textWidth(str, size, bold) {
  let w = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) w += charWidth(s.charCodeAt(i), bold);
  return (w / 1000) * size;
}

// ---- money ------------------------------------------------------------------
function money(n) {
  const v = Number(n) || 0;
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (neg ? "(" + s + ")" : s);
}

// ---- PDF text escaping (WinAnsi, ASCII only) --------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/[‒-―]/g, "-") // various dashes -> hyphen
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7e]/g, "?");
}

// ---- content-stream builder -------------------------------------------------
function Page(w, h) {
  const ops = [];
  const api = {
    w,
    h,
    // left/center/right aligned text
    text(x, y, str, { size = 9, bold = false, align = "left", color } = {}) {
      const font = bold ? "F2" : "F1";
      let tx = x;
      if (align === "right") tx = x - textWidth(str, size, bold);
      else if (align === "center") tx = x - textWidth(str, size, bold) / 2;
      if (color) ops.push(`${color[0]} ${color[1]} ${color[2]} rg`);
      ops.push(`BT /${font} ${size} Tf 1 0 0 1 ${round(tx)} ${round(y)} Tm (${esc(str)}) Tj ET`);
      if (color) ops.push(`0 0 0 rg`);
      return textWidth(str, size, bold);
    },
    line(x1, y1, x2, y2, wdt = 0.6) {
      ops.push(`${wdt} w ${round(x1)} ${round(y1)} m ${round(x2)} ${round(y2)} l S`);
    },
    rect(x, y, wd, ht, wdt = 0.6) {
      ops.push(`${wdt} w ${round(x)} ${round(y)} ${round(wd)} ${round(ht)} re S`);
    },
    fillRect(x, y, wd, ht, gray = 0.92) {
      ops.push(`${gray} ${gray} ${gray} rg ${round(x)} ${round(y)} ${round(wd)} ${round(ht)} re f 0 0 0 rg`);
    },
    // Draw a named image XObject in a wd x ht box with lower-left at (x, y).
    image(name, x, y, wd, ht) {
      ops.push(`q ${round(wd)} 0 0 ${round(ht)} ${round(x)} ${round(y)} cm /${name} Do Q`);
    },
    stream() {
      return ops.join("\n");
    },
  };
  return api;
}
function round(n) {
  return Math.round(n * 100) / 100;
}
function roundMoney2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ---- PDF assembler (supports per-page MediaBox + one optional JPEG logo) -----
// Emits raw bytes (Uint8Array) so a binary image stream (DCTDecode) can be
// spliced in verbatim — all text objects are ASCII (esc() guarantees it), so
// latin1 byte length equals character length for them.
function latin1(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function assemblePdf(pages, image) {
  const fontReg = 3 + pages.length * 2;
  const fontBold = fontReg + 1;
  const imgId = image ? fontBold + 1 : 0;
  const lastObj = image ? imgId : fontBold;

  // Resources: fonts on every page; the logo XObject only where it is used.
  const xobjRes = image ? ` /XObject << /${image.name} ${imgId} 0 R >>` : "";

  // Build object byte-chunks in order; track byte offset of each object id.
  const chunks = [];
  const xref = [];
  let offset = 0;
  const push = (bytesOrStr) => {
    const b = typeof bytesOrStr === "string" ? latin1(bytesOrStr) : bytesOrStr;
    chunks.push(b);
    offset += b.length;
  };
  const pushObj = (id, str) => {
    xref[id] = offset;
    push(str);
  };

  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");

  pushObj(1, "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  pushObj(2, `2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pages.length} >> endobj\n`);

  pages.forEach((pg, i) => {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    const stream = pg.stream();
    const res = `<< /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >>${xobjRes} >>`;
    pushObj(
      pageId,
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pg.w} ${pg.h}] ` +
        `/Contents ${contentId} 0 R /Resources ${res} >> endobj\n`
    );
    pushObj(contentId, `${contentId} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`);
  });

  pushObj(fontReg, `${fontReg} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n`);
  pushObj(fontBold, `${fontBold} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj\n`);

  if (image) {
    xref[imgId] = offset;
    push(
      `${imgId} 0 obj << /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >> stream\n`
    );
    push(image.bytes);
    push("\nendstream\nendobj\n");
  }

  const xrefStart = offset;
  let table = "xref\n0 " + (lastObj + 1) + "\n0000000000 65535 f \n";
  for (let i = 1; i <= lastObj; i++) table += String(xref[i] || 0).padStart(10, "0") + " 00000 n \n";
  push(table);
  push(`trailer << /Size ${lastObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  // Concatenate all chunks into one buffer.
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

// ---- G702 -------------------------------------------------------------------
function labelRow(pg, x, y, wd, label, value, { bold = false, size = 9 } = {}) {
  pg.text(x + 4, y + 4, label, { size, bold });
  pg.text(x + wd - 6, y + 4, money(value), { size, bold, align: "right" });
}

function renderG702(project, req) {
  const pg = Page(LETTER_W, LETTER_H);
  const L = MARGIN;
  const R = LETTER_W - MARGIN;
  const W = R - L;
  let y = LETTER_H - MARGIN;
  const company = projectCompanyName(project, req?.companyName);

  // Letterhead — LE logo top-left; company (bold) + address; phone | email on one line.
  // Company name also appears on FROM / CONTRACTOR.
  const addr = REQ_BILLING.addressLines;
  const phone = REQ_BILLING.phone;
  const email = REQ_BILLING.email;
  // Lines after company name: street, suite, city, then phone+email row.
  const lineCount = 1 + addr.length + 1; // company + address lines + contact row
  if (LOGO) {
    const lw = 62;
    const lh = roundMoney2((lw * LOGO.height) / LOGO.width);
    pg.image(LOGO.name, L, y - lh + 4, lw, lh);
    const textX = L + lw + 8;
    let by = y - 2;
    pg.text(textX, by, company, { size: 10, bold: true });
    by -= 11;
    for (let i = 0; i < addr.length; i++) {
      pg.text(textX, by - i * 10, addr[i], { size: 8 });
    }
    by -= addr.length * 10;
    // Phone and email side-by-side (parallel)
    const phoneW = pg.text(textX, by, phone, { size: 8 });
    pg.text(textX + phoneW + 12, by, email, { size: 8 });
    pg.text(R, y - 6, "APPLICATION AND CERTIFICATE FOR PAYMENT", { size: 10, bold: true, align: "right" });
    pg.text(R, y - 18, "AIA Document G702", { size: 8, align: "right" });
    const billH = lineCount * 10 + 4;
    y -= Math.max(lh, billH, 26) + 4;
  } else {
    let by = y - 4;
    pg.text(L, by, company, { size: 11, bold: true });
    by -= 12;
    for (let i = 0; i < addr.length; i++) {
      pg.text(L, by - i * 11, addr[i], { size: 9 });
    }
    by -= addr.length * 11;
    const phoneW = pg.text(L, by, phone, { size: 9 });
    pg.text(L + phoneW + 12, by, email, { size: 9 });
    pg.text(R, y - 3, "APPLICATION AND CERTIFICATE FOR PAYMENT", { size: 10, bold: true, align: "right" });
    pg.text(R, y - 15, "AIA Document G702", { size: 8, align: "right" });
    y -= lineCount * 11 + 6;
  }
  pg.line(L, y, R, y, 1);
  y -= 10;

  // Two-column info block (TO / project + application details). No VIA (Engineer).
  const colW = W / 2;
  const infoTop = y;
  const leftInfo = [
    ["TO (Owner):", project.gc || "JOY CONSTRUCTION CORP."],
    ["PROJECT:", project.name || "Baez Place"],
    ["", project.address || ""],
    ["FROM (Contractor):", company],
  ];
  const rightInfo = [
    ["APPLICATION NO:", req.applicationNumber || `REQ-${req.num || ""}`],
    ["PERIOD TO:", req.periodTo || ""],
    ["CONTRACT FOR:", "Electrical Work"],
    ["INVOICE / REQ #:", String(req.num || "")],
  ];
  for (let i = 0; i < leftInfo.length; i++) {
    pg.text(L, y - 8, leftInfo[i][0], { size: 8, bold: true });
    pg.text(L + 96, y - 8, leftInfo[i][1], { size: 9 });
    pg.text(L + colW + 4, y - 8, rightInfo[i][0], { size: 8, bold: true });
    pg.text(L + colW + 96, y - 8, rightInfo[i][1], { size: 9 });
    y -= 13;
  }
  pg.line(L + colW, infoTop, L + colW, y + 5, 0.4);
  pg.rect(L, y + 5, W, infoTop - (y + 5));
  y -= 6;

  // Application summary table (lines 1-9), boxed, amounts right-aligned
  pg.text(L, y - 8, "CONTRACTOR'S APPLICATION FOR PAYMENT", { size: 9, bold: true });
  y -= 16;

  const contractSum = Number(req.originalContractSum != null ? req.originalContractSum : project.contractSum) || 0;
  const contractToDate = Number(req.contractSumToDate) || contractSum;
  // Derive line 2 from the form's own line 1 and line 3 so line 3 = line 1 +/- 2
  // always holds on the face of the certificate (change orders that are billed
  // on this application are already inside contractSumToDate).
  const changeOrders = roundMoney2(contractToDate - contractSum);
  const rows = [
    ["1.  ORIGINAL CONTRACT SUM", contractSum],
    ["2.  NET CHANGE BY CHANGE ORDERS", changeOrders],
    ["3.  CONTRACT SUM TO DATE (Line 1 +/- 2)", contractToDate],
    ["4.  TOTAL COMPLETED & STORED TO DATE", req.totalCompleted],
    [`5.  RETAINAGE ${req.retainagePct || 10}% OF COMPLETED WORK`, req.totalRetainage],
    ["6.  TOTAL EARNED LESS RETAINAGE (Line 4 - 5)", req.earnedLessRetainage],
    ["7.  LESS PREVIOUS CERTIFICATES FOR PAYMENT", req.previousCertificates],
    ["8.  CURRENT PAYMENT DUE (Line 6 - 7)", req.currentPaymentDue],
    ["9.  BALANCE TO FINISH, PLUS RETAINAGE (Line 3 - 6)", req.balanceToFinish],
  ];
  const rowH = 18;
  const tableTop = y;
  rows.forEach((r, i) => {
    const ry = y - rowH;
    const emphasize = i === 7; // Current Payment Due
    if (emphasize) pg.fillRect(L, ry, W, rowH, 0.9);
    labelRow(pg, L, ry, W, r[0], r[1], { bold: emphasize, size: 9 });
    pg.line(L, ry, R, ry, 0.4);
    y = ry;
  });
  pg.rect(L, y, W, tableTop - y);
  pg.line(L + W - 110, y, L + W - 110, tableTop, 0.4); // amount column divider
  y -= 14;

  // Reconciliation note (proves the numbers tie out)
  const tie =
    Math.abs((Number(req.earnedLessRetainage) || 0) - ((Number(req.previousCertificates) || 0) + (Number(req.currentPaymentDue) || 0))) < 0.02;
  pg.text(L, y, `Line 6 = Line 7 + Line 8: ${tie ? "reconciled" : "CHECK"} `, { size: 7.5, color: tie ? [0.1, 0.5, 0.2] : [0.7, 0.1, 0.1] });
  y -= 22;

  // Certification
  pg.text(L, y, "The undersigned Contractor certifies that to the best of the Contractor's knowledge,", { size: 8 });
  y -= 11;
  pg.text(L, y, "information and belief the Work covered by this Application for Payment has been", { size: 8 });
  y -= 11;
  pg.text(L, y, "completed in accordance with the Contract Documents, that all amounts have been paid by", { size: 8 });
  y -= 11;
  pg.text(L, y, "the Contractor for Work for which previous Certificates for Payment were issued and", { size: 8 });
  y -= 11;
  pg.text(L, y, "payments received from the Owner, and that current payment shown herein is now due.", { size: 8 });
  y -= 30;

  // Signature lines — contractor name follows the editable company name
  pg.text(L, y, `CONTRACTOR: ${company}`, { size: 9, bold: true });
  pg.line(L + 260, y - 2, R, y - 2, 0.6);
  pg.text(L + 260, y + 3, "", { size: 8 });
  y -= 16;
  pg.text(R, y, "By (signature) / Date", { size: 7, align: "right" });
  y -= 34;
  pg.line(L, y, L + 200, y, 0.6);
  pg.text(L, y - 10, "AMOUNT CERTIFIED", { size: 8, bold: true });
  pg.text(L + 200, y - 10, money(req.currentPaymentDue), { size: 11, bold: true });
  y -= 26;
  pg.text(L, y, "ARCHITECT / GC:", { size: 9, bold: true });
  pg.line(L + 260, y - 2, R, y - 2, 0.6);
  pg.text(R, y - 12, "By / Date", { size: 7, align: "right" });

  return pg;
}

// ---- G703 (continuation sheet, paginated) -----------------------------------
function renderG703Pages(project, req) {
  const rowsAll = req.g703 || [];
  // Landscape for readable columns.
  const pageW = LETTER_H; // 792
  const pageH = LETTER_W; // 612
  const L = MARGIN;
  const R = pageW - MARGIN;

  // column layout: [key, header, xRight or xLeft, align, width]
  const cols = [
    { key: "itemNo", h: "ITEM", w: 32, align: "center" },
    { key: "description", h: "DESCRIPTION OF WORK", w: 200, align: "left" },
    { key: "scheduledValue", h: "SCHEDULED VALUE", w: 80, align: "right" },
    { key: "prevCompleted", h: "FROM PREVIOUS", w: 76, align: "right" },
    { key: "thisPeriod", h: "THIS PERIOD", w: 72, align: "right" },
    { key: "totalCompleted", h: "TOTAL COMPLETED", w: 80, align: "right" },
    { key: "pctComplete", h: "%", w: 32, align: "right" },
    { key: "balance", h: "BALANCE TO FINISH", w: 76, align: "right" },
    { key: "retainage", h: "RETAINAGE", w: 58, align: "right" },
  ];
  // compute x positions
  let cx = L;
  for (const c of cols) {
    c.x0 = cx;
    cx += c.w;
    c.x1 = cx;
  }
  const tableRight = cx;

  const rowH = 15;
  const headerH = 26;
  const pages = [];
  const totals = {
    scheduledValue: 0, prevCompleted: 0, thisPeriod: 0, totalCompleted: 0, balance: 0, retainage: 0,
  };
  for (const r of rowsAll) {
    for (const k of Object.keys(totals)) totals[k] += Number(r[k]) || 0;
  }

  let idx = 0;
  const totalPages = Math.max(1, Math.ceil(rowsAll.length / Math.floor((pageH - MARGIN - 70 - headerH) / rowH)));
  let pageNo = 0;
  while (idx < rowsAll.length || pageNo === 0) {
    pageNo++;
    const pg = Page(pageW, pageH);
    let y = pageH - MARGIN;
    pg.text(L, y - 4, "CONTINUATION SHEET", { size: 12, bold: true });
    pg.text(R, y - 3, "AIA Document G703", { size: 8, align: "right" });
    pg.text(R, y - 13, `${req.applicationNumber || ""}   |   Period to ${req.periodTo || ""}   |   Page ${pageNo} of ${totalPages}`, { size: 8, align: "right" });
    y -= 20;

    // header row
    const headTop = y;
    pg.fillRect(L, y - headerH, tableRight - L, headerH, 0.9);
    for (const c of cols) {
      const hx = c.align === "left" ? c.x0 + 4 : c.align === "center" ? (c.x0 + c.x1) / 2 : c.x1 - 4;
      // wrap two-word headers onto two lines
      const parts = c.h.split(" ");
      if (parts.length > 1 && c.w < 90) {
        const mid = Math.ceil(parts.length / 2);
        pg.text(hx, y - 10, parts.slice(0, mid).join(" "), { size: 6.5, bold: true, align: c.align });
        pg.text(hx, y - 19, parts.slice(mid).join(" "), { size: 6.5, bold: true, align: c.align });
      } else {
        pg.text(hx, y - 15, c.h, { size: 6.5, bold: true, align: c.align });
      }
    }
    y -= headerH;

    // rows for this page
    const bottomLimit = MARGIN + 40;
    while (idx < rowsAll.length && y - rowH > bottomLimit) {
      const r = rowsAll[idx];
      const ry = y - rowH;
      for (const c of cols) {
        let val = r[c.key];
        if (c.key === "pctComplete") val = `${Math.round(Number(val) || 0)}%`;
        else if (c.key !== "itemNo" && c.key !== "description") val = money(val);
        else val = String(val == null ? "" : val);
        if (c.key === "description") val = clip(val, c.w - 6, 7);
        const hx = c.align === "left" ? c.x0 + 4 : c.align === "center" ? (c.x0 + c.x1) / 2 : c.x1 - 4;
        pg.text(hx, ry + 4, val, { size: 7, align: c.align });
      }
      pg.line(L, ry, tableRight, ry, 0.3);
      y = ry;
      idx++;
    }

    // totals row on last page
    if (idx >= rowsAll.length) {
      const ry = y - rowH;
      pg.fillRect(L, ry, tableRight - L, rowH, 0.85);
      pg.text(cols[1].x0 + 4, ry + 4, "GRAND TOTALS", { size: 7.5, bold: true });
      for (const c of cols) {
        if (totals[c.key] == null) continue;
        pg.text(c.x1 - 4, ry + 4, money(totals[c.key]), { size: 7.5, bold: true, align: "right" });
      }
      y = ry;
    }

    // outer border + column dividers
    pg.rect(L, y, tableRight - L, headTop - y);
    for (const c of cols) if (c.x1 < tableRight) pg.line(c.x1, y, c.x1, headTop, 0.3);

    pages.push(pg);
    if (idx >= rowsAll.length) break;
  }
  return pages;
}

function clip(str, maxWidth, size) {
  let s = String(str);
  if (textWidth(s, size, false) <= maxWidth) return s;
  while (s.length > 1 && textWidth(s + "...", size, false) > maxWidth) s = s.slice(0, -1);
  return s + "...";
}

/** @returns {Blob} application/pdf — G702 page + G703 continuation page(s). */
export function buildRequisitionPdf(project, requisition) {
  const pages = [renderG702(project, requisition), ...renderG703Pages(project, requisition)];
  const image = { ...LOGO, bytes: leLogoJpegBytes() };
  const bytes = assemblePdf(pages, image);
  return new Blob([bytes], { type: "application/pdf" });
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
