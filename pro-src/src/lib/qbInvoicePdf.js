import {
  POWERED_BY_LE,
  POWERED_BY_LE_PDF_COLOR,
  POWERED_BY_LE_PDF_SIZE,
} from "./brand.js";
// QuickBooks-clone invoice/estimate PDF — 100% client-side byte-writer port of
// netlify/functions/lib/le-invoice-suite/qb-pdf.js (the server pdfkit template).
// Layout (Levi 2026-07-22):
//   Top-left company · centered logo · top-right ESTIMATE/INVOICE + meta
//   Billing address | Service address side-by-side
//   Description table raised; multi-page when description is long so totals never clip
import { LE_LOGO_JPEG, leLogoJpegBytes } from "./leLogoJpeg.js";
import { activeTenantConfig, tenantCompany } from "./tenantBranding.js";
import { wrapPrintDescription } from "./printDescription.js";

const PAGE_W = 612;
const PAGE_H = 792;
const M = 36;

// Colors (0..1 RGB) — mirror qb-pdf.js STYLE.colors
const GREEN = [6 / 255, 106 / 255, 52 / 255]; // #066a34
const GRAY = [141 / 255, 144 / 255, 150 / 255]; // #8d9096
const BLACK = [0, 0, 0];
const HEADERBG = [205 / 255, 225 / 255, 214 / 255]; // #cde1d6
const RULE = [186 / 255, 190 / 255, 197 / 255]; // #babec5

// Content must stop above the footer zone
const FOOTER_LIMIT = 700;

// Helvetica AFM advance widths (/1000 em, ASCII 32..126)
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
export const qbMoney = (n) =>
  (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Word-wrap to a pixel width (returns lines). Preserves blank lines + bullets. */
function wrap(str, maxW, size, bold = false) {
  return wrapPrintDescription(str, maxW, (s) => textWidth(s, size, bold));
}

function Page() {
  const ops = [];
  // baselineY is measured from the TOP (like qb-pdf's textAtBaseline).
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
    dottedRule(x1, x2, topY) {
      const y = PAGE_H - topY;
      ops.push(`${RULE[0]} ${RULE[1]} ${RULE[2]} RG 1 w [1 2] 0 d ${r2(x1)} ${r2(y)} m ${r2(x2)} ${r2(y)} l S [] 0 d`);
    },
    image(name, x, topY, w, h) {
      ops.push(`q ${r2(w)} 0 0 ${r2(h)} ${r2(x)} ${r2(PAGE_H - topY - h)} cm /${name} Do Q`);
    },
    center(str, baselineY, opts = {}) {
      text((PAGE_W - textWidth(str, opts.size || 10, opts.bold)) / 2, baselineY, str, opts);
    },
    stream: () => ops.join("\n"),
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
  // Object map: 1 Catalog, 2 Pages, then per page: Page + Content, then fonts + image
  // Page i objects: pageObj = 3 + i*2, contentObj = 4 + i*2
  const fontReg = 3 + n * 2;
  const fontBold = fontReg + 1;
  const imgId = fontBold + 1;

  const pageKids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  obj(1, "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  obj(2, `2 0 obj << /Type /Pages /Kids [${pageKids}] /Count ${n} >> endobj\n`);

  for (let i = 0; i < n; i++) {
    const pageObj = 3 + i * 2;
    const contentObj = 4 + i * 2;
    const stream = pages[i].stream();
    obj(
      pageObj,
      `${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentObj} 0 R ` +
        `/Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> /XObject << /${image.name} ${imgId} 0 R >> >> >> endobj\n`
    );
    obj(contentObj, `${contentObj} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`);
  }

  obj(fontReg, `${fontReg} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n`);
  obj(fontBold, `${fontBold} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj\n`);
  xref[imgId] = offset;
  push(
    `${imgId} 0 obj << /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >> stream\n`
  );
  push(image.bytes);
  push("\nendstream\nendobj\n");
  const xrefStart = offset;
  const maxId = imgId;
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
function latin1(s) {
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xff;
  return o;
}

/**
 * Render a QuickBooks-clone invoice/estimate. `data` is the mapJobToQbDocData
 * shape: { docType, company:{name,addressLines,phone,email}, docNumber, date,
 * dueDate, terms, billTo:{name,addressLines}, customFields:[{label,value}],
 * serviceDate, lines:[{description,rate,qty,amount}], subtotal, tax, total,
 * payment, messageLines:[], footerLines:[], showAcceptance, payUrl }.
 */
export function buildQbDocPdf(data) {
  const docType = String(data.docType || "INVOICE").toUpperCase();
  const isEstimate = docType === "ESTIMATE";
  const company = data.company || {};
  const subtotal = data.subtotal != null ? Number(data.subtotal) : (data.lines || []).reduce((s, l) => s + Number(l.amount || 0), 0);
  const tax = Number(data.tax || 0);
  const total = data.total != null ? Number(data.total) : subtotal + tax;
  const payment = Number(data.payment || 0);

  // ---- Layout constants (Levi 2026-07-22) ---------------------------------
  // Logo top y=36; ESTIMATE/INVOICE title sits at same height top-right.
  const LOGO = { x: 254.25, y: 36, w: 103.5, h: 81 };
  const TITLE_Y = 50; // same height band as logo top / company name
  const META_Y = 68; // doc # / date / due date under the title word
  const META_LEAD = 13.5;
  const ADDR_COL_RIGHT = 306; // service address column (halfway across page)
  const LEAD = 13.5;
  const descTextX = 39.75;
  const descW = 396.5 - 39.75;

  // Service address from customFields (preferred) or explicit field
  const svcField =
    (data.customFields || []).find((cf) => cf && /service\s*address/i.test(String(cf.label || "")) && cf.value) ||
    null;
  const serviceAddress = svcField
    ? String(svcField.value)
    : data.serviceAddress
      ? String(data.serviceAddress)
      : "";

  // Precompute message blocks
  let paymentMsg = null;
  let closingMsg = null;
  if (data.messageLines !== null) {
    const tenant = tenantCompany();
    const profile = activeTenantConfig().profile || {};
    const defaultMsg = [
      'Online Payment: Click the "View Invoice" tab in the email and pay',
      "via the provided credit card payment link.",
      `-${profile.zelleInstructions}`,
      `-Check: Make checks payable to "${tenant.name}" and either: Mail`,
      `it or Email a clear picture of the check to ${tenant.email}.`,
      "",
      "Thank you for your business - we appreciate it very much.",
      "",
      "Sincerely,",
      company.name || tenant.name,
    ];
    const msg = [...(data.messageLines || defaultMsg)];
    if (data.payUrl) {
      msg.unshift("Pay securely online:", data.payUrl, "");
    }
    const thanksIdx = msg.findIndex((l) => /Thank you for your business/i.test(String(l || "")));
    if (thanksIdx >= 0) {
      paymentMsg = msg.slice(0, thanksIdx).filter((l, i, a) => !(l === "" && i === a.length - 1));
      closingMsg = msg.slice(thanksIdx);
    } else {
      paymentMsg = msg;
      closingMsg = [];
    }
  }

  const pages = [];
  let pg = Page();
  pages.push(pg);

  /** Company block + logo only (no title — title is page-1 top-right). */
  const drawCompanyLogo = (page) => {
    page.text(M, 46.5, company.name || "", { size: 10.98, bold: true, color: BLACK });
    const details = [
      ...(company.addressLines || []),
      company.phone,
      company.email,
      company.license,
    ].filter(Boolean);
    details.forEach((ln, i) => page.text(M, 61.5 + i * 12.75, ln, { size: 7.32, color: BLACK }));
    page.image("ImLogo", LOGO.x, LOGO.y, LOGO.w, LOGO.h);
    return 61.5 + details.length * 12.75;
  };

  /** Table header band + column labels. Returns bottom y of band. */
  const drawTableHeader = (page, tableTop) => {
    page.fillRect(M, tableTop, 540, 21, HEADERBG);
    const hb = tableTop + 14.25;
    page.text(39.75, hb, "DESCRIPTION", { size: 9.15, color: GREEN });
    page.text(448.4, hb, "RATE", { size: 9.15, color: GREEN, align: "right" });
    page.text(491.6, hb, "QTY", { size: 9.15, color: GREEN, align: "right" });
    page.text(572.6, hb, "AMOUNT", { size: 9.15, color: GREEN, align: "right" });
    return tableTop + 21;
  };

  // ---- PAGE 1 HEADER: company left · logo center · title+meta right ------
  const companyBottom = drawCompanyLogo(pg);

  // Title word top-right, same height as logo top / company name
  pg.text(PAGE_W - M, TITLE_Y, docType, { size: 13.72, color: GREEN, align: "right" });

  // Meta under the title word (same height band as the logo)
  const rightRows = [[docType, data.docNumber], ["DATE", data.date]];
  if (!isEstimate && data.dueDate) rightRows.push(["DUE DATE", data.dueDate]);
  if (!isEstimate && data.terms) rightRows.push(["TERMS", data.terms]);
  let ry = META_Y;
  for (const [label, value] of rightRows) {
    pg.text(396.45, ry, label, { size: 9.15, color: GRAY });
    pg.text(477.23, ry, String(value ?? ""), { size: 9.15, color: BLACK });
    ry += META_LEAD;
  }
  const rightBottom = ry;

  // ---- ADDRESSES: billing left · service right (parallel) ---------------
  let addrTop = Math.max(companyBottom, LOGO.y + LOGO.h, rightBottom) + 14;

  const billLines = [data.billTo?.name, ...(data.billTo?.addressLines || [])].filter(Boolean);
  const svcLines = serviceAddress
    ? String(serviceAddress)
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // BILLING ADDRESS (left)
  pg.text(M, addrTop, "BILLING ADDRESS", { size: 9.15, color: GRAY });
  let by = addrTop + 13.5;
  for (const ln of billLines) {
    pg.text(M, by, ln, { size: 9.15, color: BLACK });
    by += 14.25;
  }

  // SERVICE ADDRESS (right half — parallel)
  let sy = addrTop;
  if (svcLines.length) {
    pg.text(ADDR_COL_RIGHT, addrTop, "SERVICE ADDRESS", { size: 9.15, color: GRAY });
    sy = addrTop + 13.5;
    for (const ln of svcLines) {
      // wrap long single-line service addresses into the right column
      const wrapped = wrap(ln, PAGE_W - M - ADDR_COL_RIGHT, 9.15);
      for (const wl of wrapped) {
        pg.text(ADDR_COL_RIGHT, sy, wl, { size: 9.15, color: BLACK });
        sy += 14.25;
      }
    }
  }

  // ---- DESCRIPTION TABLE (raised a few lines) ---------------------------
  const tableTop = Math.max(by, sy) + 12;
  let cursor = drawTableHeader(pg, tableTop);

  if (data.serviceDate) {
    cursor += 7.5;
    pg.text(descTextX, cursor + 10.75, String(data.serviceDate), { size: 10.07, color: BLACK });
    cursor += LEAD;
  }

  /** Start a new page for overflow rows/totals. Returns new cursor after header. */
  const newPageForRows = () => {
    pg = Page();
    pages.push(pg);
    drawCompanyLogo(pg);
    // Continuation pages keep a compact top band (logo + company), then table
    return drawTableHeader(pg, 130);
  };

  for (const line of data.lines || []) {
    cursor += 7.5;
    const dlines = wrap(line.description, descW, 10.07);
    // If the whole row won't fit, jump first so description starts clean on next page
    const minRowH = Math.min(dlines.length, 1) * LEAD + 10;
    if (cursor + minRowH > FOOTER_LIMIT) {
      cursor = newPageForRows();
      cursor += 7.5;
    }

    // Paint numbers on first baseline of this row chunk
    let firstOfRow = true;
    let i = 0;
    while (i < dlines.length) {
      const firstBaseline = cursor + 10.75;
      // How many description lines fit on this page?
      let fit = 0;
      while (i + fit < dlines.length) {
        const nextY = firstBaseline + fit * LEAD;
        if (nextY > FOOTER_LIMIT) break;
        fit++;
      }
      if (fit === 0) {
        // Even one line won't fit — new page and retry
        cursor = newPageForRows();
        cursor += 7.5;
        continue;
      }
      for (let j = 0; j < fit; j++) {
        pg.text(descTextX, firstBaseline + j * LEAD, dlines[i + j], { size: 10.07, color: BLACK });
      }
      if (firstOfRow) {
        pg.text(448.4, firstBaseline, qbMoney(line.rate), { size: 10.07, color: BLACK, align: "right" });
        pg.text(491.6, firstBaseline, String(Number(line.qty)), { size: 10.07, color: BLACK, align: "right" });
        pg.text(572.6, firstBaseline, qbMoney(line.amount), { size: 10.07, color: BLACK, align: "right" });
        firstOfRow = false;
      }
      i += fit;
      cursor = firstBaseline + fit * LEAD - 10.75 + LEAD;
      // More description remains → continue on next page
      if (i < dlines.length) {
        cursor = newPageForRows();
        cursor += 7.5;
      }
    }
  }

  // ---- TOTALS — never clip; push to next page if needed ------------------
  const totalsNeed = 120;
  if (cursor + totalsNeed > FOOTER_LIMIT) {
    cursor = newPageForRows();
  }
  const totalsTop = cursor + 11.25;
  pg.dottedRule(M, M + 540, totalsTop);

  if (paymentMsg) {
    let my = totalsTop + 22.5;
    for (const lineTxt of paymentMsg) {
      if (lineTxt === "") {
        my += 10.5;
        continue;
      }
      for (const wl of wrap(lineTxt, 240, 7.62)) {
        pg.text(M, my, wl, { size: 7.62, color: GRAY });
        my += 10.5;
      }
    }
  }

  let ty = totalsTop + 22.5;
  const totalRows = [["SUBTOTAL", qbMoney(subtotal)], ["TAX", qbMoney(tax)]];
  if (payment) totalRows.push(["PAYMENT", "-" + qbMoney(payment)]);
  for (const [label, value] of totalRows) {
    pg.text(298.96, ty, label, { size: 10.07, color: GRAY });
    pg.text(572.6, ty, value, { size: 10.07, color: BLACK, align: "right" });
    ty += 21;
  }
  pg.dottedRule(295.5, M + 540, ty - 21 + 10.5);
  ty += 13.5;
  const bigLabel = data.totalLabel || (isEstimate ? "TOTAL" : "BALANCE DUE");
  const bigAmount = payment ? total - payment : total;
  pg.text(298.96, ty, bigLabel, { size: 10.07, color: GRAY });
  pg.text(572.6, ty, "$" + qbMoney(bigAmount), { size: 14.09, bold: true, color: BLACK, align: "right" });

  if (closingMsg && closingMsg.length) {
    let my = ty + 28;
    for (const lineTxt of closingMsg) {
      if (lineTxt === "") {
        my += 10.5;
        continue;
      }
      for (const wl of wrap(lineTxt, 240, 7.62)) {
        pg.text(M, my, wl, { size: 7.62, color: GRAY });
        my += 10.5;
      }
    }
  }

  const showAcceptance = data.showAcceptance != null ? data.showAcceptance : isEstimate;
  if (showAcceptance) {
    pg.text(M, ty + 54, "Accepted By", { size: 9.15, color: GRAY });
    pg.text(M, ty + 81, "Accepted Date", { size: 9.15, color: GRAY });
  }

  // ---- FOOTERS on every page --------------------------------------------
  const fLines =
    data.footerLines || [
      "Thank you for your business!",
      "",
      `If you have any questions concerning this ${docType.toLowerCase()} please contact us.`,
      `Phone: ${company.phone} Email: ${company.email}`,
    ];
  const pageCount = pages.length;
  pages.forEach((page, idx) => {
    page.center(fLines[0], 706, { size: 10, color: GRAY });
    let fy = 734;
    for (const l of fLines.slice(2)) {
      page.center(l, fy, { size: 10, color: GRAY });
      fy += 14;
    }
    page.center(`Page ${idx + 1} of ${pageCount}`, fy, { size: 10, color: GRAY });
    page.center(POWERED_BY_LE, fy + 14, {
      size: POWERED_BY_LE_PDF_SIZE,
      color: POWERED_BY_LE_PDF_COLOR,
    });
  });

  const image = { name: "ImLogo", width: LE_LOGO_JPEG.width, height: LE_LOGO_JPEG.height, bytes: leLogoJpegBytes() };
  return new Blob([assemblePdf(pages, image)], { type: "application/pdf" });
}
