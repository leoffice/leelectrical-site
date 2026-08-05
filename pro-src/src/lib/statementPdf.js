// Statement PDF — same letterhead (company + logo + green title + Powered by LE footer)
// as invoice/estimate (qbInvoicePdf). Body is statement rows, not line-items.
// Spec: handoff/generate-statement + LEPRO_STATEMENT_LETTERHEAD_SETTINGS_SPEC §1.
import {
  POWERED_BY_LE,
  POWERED_BY_LE_PDF_COLOR,
  POWERED_BY_LE_PDF_SIZE,
} from "./brand.js";
import { resolvePdfLogoImageSync } from "./companyLogoPdf.js";
import { qbCompany } from "./jobToQbDoc.js";
import { qbMoney } from "./qbInvoicePdf.js";
import { tenantCompany } from "./tenantBranding.js";

const PAGE_W = 612;
const PAGE_H = 792;
const M = 36;
const GREEN = [6 / 255, 106 / 255, 52 / 255];
const GRAY = [141 / 255, 144 / 255, 150 / 255];
const BLACK = [0, 0, 0];
const HEADERBG = [205 / 255, 225 / 255, 214 / 255];
const RULE = [186 / 255, 190 / 255, 197 / 255];

const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELVB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function textWidth(str, size, bold) {
  const t = bold ? HELVB : HELV;
  let w = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 32 || c > 126) c = 63;
    w += t[c - 32];
  }
  return (w / 1000) * size;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7e]/g, "?");
}

const r2 = (n) => Math.round(n * 100) / 100;

/** Fit text to width without ellipsis (Levi 2026-08-05 — no three dots on statements). */
function clip(str, maxW, size, bold = false) {
  let s = String(str || "");
  if (textWidth(s, size, bold) <= maxW) return s;
  while (s.length > 1 && textWidth(s, size, bold) > maxW) s = s.slice(0, -1);
  return s;
}

/** Word-wrap into up to maxLines lines; no "..." (Levi statement description). */
function wrapLines(str, maxW, size, maxLines = 2, bold = false) {
  const words = String(str || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (textWidth(trial, size, bold) <= maxW) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      else lines.push(clip(w, maxW, size, bold));
      cur = textWidth(w, size, bold) <= maxW ? w : clip(w, maxW, size, bold);
      if (lines.length >= maxLines) {
        cur = "";
        break;
      }
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.length ? lines : [""];
}

function latin1(s) {
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xff;
  return o;
}

function Page() {
  const ops = [];
  const annots = [];
  const text = (x, baselineY, str, { size = 10, bold = false, color = BLACK, align = "left" } = {}) => {
    let tx = x;
    if (align === "right") tx = x - textWidth(str, size, bold);
    const font = bold ? "F2" : "F1";
    ops.push(`${color[0]} ${color[1]} ${color[2]} rg`);
    ops.push(`BT /${font} ${size} Tf 1 0 0 1 ${r2(tx)} ${r2(PAGE_H - baselineY)} Tm (${esc(str)}) Tj ET`);
  };
  return {
    text,
    fillRect(x, topY, w, h, color) {
      ops.push(`${color[0]} ${color[1]} ${color[2]} rg ${r2(x)} ${r2(PAGE_H - topY - h)} ${r2(w)} ${r2(h)} re f`);
    },
    rule(x1, x2, topY, w = 0.5) {
      const y = PAGE_H - topY;
      ops.push(`${RULE[0]} ${RULE[1]} ${RULE[2]} RG ${w} w ${r2(x1)} ${r2(y)} m ${r2(x2)} ${r2(y)} l S`);
    },
    image(name, x, topY, w, h) {
      ops.push(`q ${r2(w)} 0 0 ${r2(h)} ${r2(x)} ${r2(PAGE_H - topY - h)} cm /${name} Do Q`);
    },
    center(str, baselineY, opts = {}) {
      text((PAGE_W - textWidth(str, opts.size || 10, opts.bold)) / 2, baselineY, str, opts);
    },
    /** Clickable link annotation — PDF user space y from bottom. */
    link(x, topY, w, h, url) {
      if (!url) return;
      const yBottom = PAGE_H - topY - h;
      annots.push({ x, y: yBottom, w, h, url: String(url) });
    },
    stream: () => ops.join("\n"),
    annots: () => annots,
  };
}

function assemblePdf(pages, image) {
  const chunks = [];
  const xref = [];
  let offset = 0;
  const push = (s) => {
    const b = typeof s === "string" ? latin1(s) : s;
    chunks.push(b);
    offset += b.length;
  };
  const obj = (id, s) => {
    xref[id] = offset;
    push(s);
  };
  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");

  const n = pages.length;
  const hasImage = !!(image && image.bytes && image.bytes.length && image.name);
  const allAnnots = pages.map((p) => (p.annots ? p.annots() : []) || []);
  const annotCount = allAnnots.reduce((s, a) => s + a.length, 0);

  // Objects: 1 Catalog, 2 Pages, per page Page+Content, fonts, optional image, then link annots
  const fontReg = 3 + n * 2;
  const fontBold = fontReg + 1;
  const imgId = hasImage ? fontBold + 1 : null;
  let nextId = (imgId || fontBold) + 1;
  const annotStartId = nextId;
  nextId += annotCount;

  const pageKids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  obj(1, "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  obj(2, `2 0 obj << /Type /Pages /Kids [${pageKids}] /Count ${n} >> endobj\n`);

  let annotIdx = 0;
  for (let i = 0; i < n; i++) {
    const pageObj = 3 + i * 2;
    const contentObj = 4 + i * 2;
    const stream = pages[i].stream();
    const pageAnnots = allAnnots[i];
    const annotRefs = pageAnnots.map(() => {
      const id = annotStartId + annotIdx;
      annotIdx += 1;
      return `${id} 0 R`;
    });
    const annotsDict = annotRefs.length ? `/Annots [${annotRefs.join(" ")}] ` : "";
    const xobjects = hasImage ? `/XObject << /${image.name} ${imgId} 0 R >> ` : "";
    obj(
      pageObj,
      `${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentObj} 0 R ` +
        `/Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> ${xobjects}>> ${annotsDict}>> endobj\n`
    );
    obj(contentObj, `${contentObj} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`);
  }

  obj(fontReg, `${fontReg} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n`);
  obj(fontBold, `${fontBold} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj\n`);
  let maxId = fontBold;
  if (hasImage) {
    xref[imgId] = offset;
    push(
      `${imgId} 0 obj << /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >> stream\n`
    );
    push(image.bytes);
    push("\nendstream\nendobj\n");
    maxId = imgId;
  }

  // Link annotation objects
  annotIdx = 0;
  for (let i = 0; i < n; i++) {
    for (const a of allAnnots[i]) {
      const id = annotStartId + annotIdx;
      annotIdx += 1;
      const uri = String(a.url || "")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");
      obj(
        id,
        `${id} 0 obj << /Type /Annot /Subtype /Link /Rect [${r2(a.x)} ${r2(a.y)} ${r2(a.x + a.w)} ${r2(a.y + a.h)}] ` +
          `/Border [0 0 0] /A << /S /URI /URI (${uri}) >> >> endobj\n`
      );
      maxId = id;
    }
  }

  const xrefStart = offset;
  let table = "xref\n0 " + (maxId + 1) + "\n0000000000 65535 f \n";
  for (let i = 1; i <= maxId; i++) table += String(xref[i] || 0).padStart(10, "0") + " 00000 n \n";
  push(table);
  push(`trailer << /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const outb = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    outb.set(c, p);
    p += c.length;
  }
  return outb;
}

/**
 * Build a QB-matched STATEMENT PDF from a statement model (see statementDoc.js).
 * @returns {Blob}
 */
export function buildQbStatementPdf(model, overrides = {}) {
  const company = overrides.company || qbCompany();
  const logoImage = resolvePdfLogoImageSync(overrides);
  const docType = "STATEMENT";
  const asOf = model?.asOf || "";
  const rows = model?.rows || [];
  const payByInv = new Map((model?.payRows || []).map((p) => [String(p.inv), p]));

  const LOGO = { x: 254.25, y: 36, w: 103.5, h: 81 };
  const TITLE_SIZE = 16;
  const TITLE_Y = 50;
  const META_Y = 68;
  const META_LEAD = 13.5;
  const META_LABEL_SIZE = 8.5;
  const META_VALUE_SIZE = 9.5;
  const META_COLON_GAP = 3;
  const ADDR_GAP_BELOW = 28;
  const FOOTER_ZONE = 100;

  const pages = [];
  let pg = Page();
  pages.push(pg);

  const drawCompanyLogo = (page, logo) => {
    page.text(M, 46.5, company.name || "", { size: 10.98, bold: true, color: BLACK });
    const details = [
      ...(company.addressLines || []),
      company.phone,
      company.email,
      company.license,
    ].filter(Boolean);
    details.forEach((ln, i) => page.text(M, 61.5 + i * 12.75, ln, { size: 7.32, color: BLACK }));
    if (logo && logo.bytes && logo.bytes.length) {
      page.image("ImLogo", LOGO.x, LOGO.y, LOGO.w, LOGO.h);
    }
    return 61.5 + details.length * 12.75;
  };

  const drawHeader = (page) => {
    const companyBottom = drawCompanyLogo(page, logoImage);
    const titleRight = PAGE_W - M;
    const titleW = textWidth(docType, TITLE_SIZE, true);
    const titleLeft = titleRight - titleW;
    page.text(titleRight, TITLE_Y, docType, { size: TITLE_SIZE, bold: true, color: GREEN, align: "right" });

    const rightRows = [
      ["DATE", asOf],
      ["TYPE", model?.typeLabel || "Open items"],
    ];
    if (model?.dateFrom || model?.dateTo) {
      // Plain ASCII only — the base-font esc() turns fancy dashes into "?".
      rightRows.push(["RANGE", `${model.dateFrom || "start"} - ${model.dateTo || "today"}`]);
    }
    const firstLetter = docType.charAt(0);
    const letterW = textWidth(firstLetter, TITLE_SIZE, true);
    const colonCenterX = titleLeft + letterW / 2;
    const colonStr = ":";
    const colonW = textWidth(colonStr, META_LABEL_SIZE, false);
    const colonLeft = colonCenterX - colonW / 2;
    const labelRightEdge = colonLeft - META_COLON_GAP;
    const valueX = colonLeft + colonW + META_COLON_GAP;
    let ry = META_Y;
    for (const [label, value] of rightRows) {
      page.text(labelRightEdge, ry, label, { size: META_LABEL_SIZE, color: GRAY, align: "right" });
      page.text(colonLeft, ry, colonStr, { size: META_LABEL_SIZE, color: GRAY });
      page.text(valueX, ry, String(value ?? ""), { size: META_VALUE_SIZE, color: BLACK });
      ry += META_LEAD;
    }
    return Math.max(companyBottom, LOGO.y + LOGO.h, ry) + ADDR_GAP_BELOW;
  };

  let y = drawHeader(pg);

  // Bill to
  pg.text(M, y, "BILL TO", { size: 9.15, color: GRAY });
  y += 14;
  pg.text(M, y, model?.customerName || "Customer", { size: 10, bold: true, color: BLACK });
  y += 13;
  if (model?.billingAddress) {
    for (const ln of String(model.billingAddress).split(/\n/)) {
      if (!ln.trim()) continue;
      pg.text(M, y, ln.trim().slice(0, 70), { size: 9, color: BLACK });
      y += 12;
    }
  }
  if (model?.firstPaymentDate && model?.type === "activity") {
    y += 4;
    pg.text(M, y, `First payment on file: ${model.firstPaymentDate}`, { size: 8.5, color: GRAY });
    y += 12;
  }
  if (model?.type === "balance_forward" && model.priorBalance) {
    y += 4;
    pg.text(M, y, `Prior balance: $${qbMoney(model.priorBalance)}`, { size: 9, bold: true, color: BLACK });
    y += 14;
  }
  y += 10;

  // Table columns — right-aligned money columns end flush with the band's
  // right edge (M+540-6), matching the invoice family. Description gets the
  // space left of where a worst-case $999,999.99 charge starts.
  const COL_DATE = M + 4;
  const COL_INV = M + 64;
  const COL_DESC = M + 124;
  const COL_CHARGE_R = M + 360;
  const COL_PAID_R = M + 444;
  const COL_BAL_R = M + 534;
  const DESC_MAX_W = COL_CHARGE_R - 56 - COL_DESC - 6;

  // Table header band
  const drawTableHead = (page, top) => {
    page.fillRect(M, top, 540, 20, HEADERBG);
    const hb = top + 13.5;
    page.text(COL_DATE, hb, "DATE", { size: 8.5, color: GREEN });
    page.text(COL_INV, hb, "INVOICE", { size: 8.5, color: GREEN });
    page.text(COL_DESC, hb, "DESCRIPTION", { size: 8.5, color: GREEN });
    page.text(COL_CHARGE_R, hb, "CHARGES", { size: 8.5, color: GREEN, align: "right" });
    page.text(COL_PAID_R, hb, "PAYMENTS", { size: 8.5, color: GREEN, align: "right" });
    page.text(COL_BAL_R, hb, "BALANCE", { size: 8.5, color: GREEN, align: "right" });
    // First row baseline clears the band (band is 20 tall; 8.5pt text ascends
    // ~6pt above its baseline — returning top+22 drew row 1 INTO the band).
    return top + 34;
  };
  y = drawTableHead(pg, y);

  const rowH = 16;
  // withTableHead=false for totals / notes overflow — a continuation page
  // that carries no rows must not start with an empty table-header band.
  const ensureSpace = (need, withTableHead = true) => {
    if (y + need < PAGE_H - FOOTER_ZONE) return;
    pg = Page();
    pages.push(pg);
    y = drawHeader(pg);
    if (withTableHead) y = drawTableHead(pg, y + 8);
    else y += 10;
  };

  for (const r of rows) {
    const isPayment = r.kind === "payment";
    // ASCII " - " only — middle-dot · becomes "?" in PDF esc() (Levi: no junk marks).
    const descRaw =
      isPayment || !r.progressLabel || (r.description || "").includes(r.progressLabel)
        ? r.description
        : `${r.progressLabel} - ${r.description}`;
    const descLines = wrapLines(descRaw, DESC_MAX_W, 8.5, isPayment ? 1 : 2);
    const thisRowH = rowH + (descLines.length > 1 ? 11 : 0);
    ensureSpace(thisRowH + 8);
    pg.text(COL_DATE, y, r.date || "-", { size: 8.5, color: BLACK });
    pg.text(COL_INV, y, r.invoiceNo || "", { size: 8.5, color: BLACK });
    descLines.forEach((ln, i) => {
      pg.text(COL_DESC, y + i * 11, ln, { size: 8.5, color: isPayment ? GRAY : BLACK });
    });
    if (isPayment) {
      pg.text(COL_CHARGE_R, y, "-", { size: 8.5, color: GRAY, align: "right" });
      pg.text(COL_PAID_R, y, r.paid ? "$" + qbMoney(r.paid) : "-", { size: 8.5, color: BLACK, align: "right" });
    } else {
      pg.text(COL_CHARGE_R, y, "$" + qbMoney(r.charge), { size: 8.5, color: BLACK, align: "right" });
      // Invoice rows on ledger types show charge only; payments are separate lines.
      // Open-items (no kind) still show amount paid on the invoice row.
      const showPaidOnInv = !r.kind && r.paid;
      pg.text(COL_PAID_R, y, showPaidOnInv ? "$" + qbMoney(r.paid) : "-", { size: 8.5, color: BLACK, align: "right" });
    }
    const bal = r.runningBalance != null ? r.runningBalance : r.balance;
    pg.text(COL_BAL_R, y, "$" + qbMoney(bal), { size: 8.5, color: BLACK, align: "right" });

    // Pay link annotation on the invoice # cell when open + url present (charge rows only)
    const pay = payByInv.get(String(r.invoiceNo));
    if (pay?.url && r.isOpen && !isPayment) {
      pg.link(COL_INV, y - 10, 56, 14, pay.url);
    }
    y += thisRowH;
  }

  // Open-items: if payments exist but weren't expanded into ledger rows, add a compact history.
  if (model?.type === "open_items" && (model?.paymentLines || []).length) {
    ensureSpace(rowH + 12, false);
    y += 4;
    pg.text(M, y, "Payment history (on open invoices)", { size: 8.5, bold: true, color: GRAY });
    y += 14;
    for (const p of model.paymentLines) {
      ensureSpace(rowH + 4, false);
      // ASCII only — middle-dot · becomes "?" in PDF esc()
      const refBit = p.ref && !/^\d+$/.test(String(p.ref)) ? ` - ${p.ref}` : "";
      const desc = `Payment - ${p.method || "Payment"}${refBit}`;
      pg.text(COL_DATE, y, p.date || "-", { size: 8.5, color: BLACK });
      pg.text(COL_INV, y, p.invoiceNo || "", { size: 8.5, color: BLACK });
      pg.text(COL_DESC, y, clip(desc, DESC_MAX_W, 8.5), { size: 8.5, color: GRAY });
      pg.text(COL_CHARGE_R, y, "-", { size: 8.5, color: GRAY, align: "right" });
      pg.text(COL_PAID_R, y, "$" + qbMoney(p.amount), { size: 8.5, color: BLACK, align: "right" });
      pg.text(COL_BAL_R, y, "-", { size: 8.5, color: GRAY, align: "right" });
      y += rowH;
    }
  }

  // Empty state
  if (!rows.length) {
    ensureSpace(24);
    pg.text(M + 4, y, "No invoices selected for this statement.", { size: 9, color: GRAY });
    y += 20;
  }

  y += 6;
  pg.rule(M, M + 540, y);
  y += 18;

  // Pay-online hint rides directly under the rows (same page as the links),
  // before the totals — never alone on a fresh page.
  if (model?.payRows?.length && rows.length) {
    ensureSpace(20, false);
    pg.text(M, y, "Pay online - tap an invoice number above (open items).", { size: 8, color: GRAY });
    y += 16;
  }

  // Totals block — overflow starts a clean page WITHOUT an empty table band.
  ensureSpace(80, false);
  const lblX = M + 320;
  const valX = COL_BAL_R;
  if (model?.type === "balance_forward" && model.priorBalance) {
    pg.text(lblX, y, "Prior balance", { size: 9, color: GRAY });
    pg.text(valX, y, "$" + qbMoney(model.priorBalance), { size: 9, color: BLACK, align: "right" });
    y += 14;
  }
  pg.text(lblX, y, "Total charges", { size: 9, color: GRAY });
  pg.text(valX, y, "$" + qbMoney(model?.totalCharge || 0), { size: 9, color: BLACK, align: "right" });
  y += 14;
  pg.text(lblX, y, "Total payments", { size: 9, color: GRAY });
  pg.text(valX, y, "$" + qbMoney(model?.totalPaid || 0), { size: 9, color: BLACK, align: "right" });
  y += 18;
  pg.text(lblX, y, "BALANCE DUE", { size: 11, bold: true, color: BLACK });
  pg.text(valX, y, "$" + qbMoney(model?.totalDue || 0), { size: 12, bold: true, color: BLACK, align: "right" });
  y += 24;

  // Footers (same family as invoice/estimate)
  const tenant = tenantCompany();
  const pageCount = pages.length;
  const multiPage = pageCount > 1;
  pages.forEach((page, idx) => {
    page.center("Thank you for your business!", 706, { size: 10, color: GRAY });
    page.center(
      `If you have any questions concerning this statement please contact us.`,
      734,
      { size: 10, color: GRAY }
    );
    page.center(`Phone: ${company.phone || tenant.phone} Email: ${company.email || tenant.email}`, 748, {
      size: 10,
      color: GRAY,
    });
    const bottomY = 764;
    page.text(M, bottomY, POWERED_BY_LE, {
      size: POWERED_BY_LE_PDF_SIZE,
      color: POWERED_BY_LE_PDF_COLOR,
    });
    if (multiPage) {
      page.text(PAGE_W - M, bottomY, `Page ${idx + 1} of ${pageCount}`, {
        size: 10,
        color: GRAY,
        align: "right",
      });
    }
  });

  return new Blob([assemblePdf(pages, logoImage)], { type: "application/pdf" });
}

/** Convenience: model → PDF blob. */
export function buildStatementPdfFromModel(model, overrides = {}) {
  return buildQbStatementPdf(model, overrides);
}
