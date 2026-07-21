import {
  POWERED_BY_LE,
  POWERED_BY_LE_PDF_COLOR,
  POWERED_BY_LE_PDF_SIZE,
} from "./brand.js";
// QuickBooks-clone invoice/estimate PDF — 100% client-side byte-writer port of
// netlify/functions/lib/le-invoice-suite/qb-pdf.js (the server pdfkit template).
// Matches the QBO layout: LE logo, green "INVOICE" heading, green table-header
// band, gray meta labels, per-line service date, two-column totals with dotted
// rules, bold BALANCE DUE, centered footer. No network / no pdfkit.
import { LE_LOGO_JPEG, leLogoJpegBytes } from "./leLogoJpeg.js";
import { activeTenantConfig, tenantCompany } from "./tenantBranding.js";

const PAGE_W = 612;
const PAGE_H = 792;
const M = 36;

// Colors (0..1 RGB) — mirror qb-pdf.js STYLE.colors
const GREEN = [6 / 255, 106 / 255, 52 / 255]; // #066a34
const GRAY = [141 / 255, 144 / 255, 150 / 255]; // #8d9096
const BLACK = [0, 0, 0];
const HEADERBG = [205 / 255, 225 / 255, 214 / 255]; // #cde1d6
const RULE = [186 / 255, 190 / 255, 197 / 255]; // #babec5

// Helvetica AFM advance widths (/1000 em, ASCII 32..126) — Arial-metric ≈ Liberation.
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

/** Word-wrap to a pixel width (returns lines). Preserves intentional newlines. */
function wrap(str, maxW, size, bold = false) {
  const out = [];
  for (const para of String(str || "").split(/\r?\n/)) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    const words = para.split(/\s+/).filter(Boolean);
    let cur = "";
    for (const w of words) {
      const next = cur ? cur + " " + w : w;
      if (textWidth(next, size, bold) > maxW && cur) {
        out.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) out.push(cur);
  }
  return out.length ? out : [""];
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

function assemblePdf(page, image) {
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
  const fontReg = 5, fontBold = 6, imgId = 7;
  obj(1, "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  obj(2, "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n");
  const stream = page.stream();
  obj(
    3,
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents 4 0 R ` +
      `/Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> /XObject << /${image.name} ${imgId} 0 R >> >> >> endobj\n`
  );
  obj(4, `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`);
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
  let table = "xref\n0 " + (imgId + 1) + "\n0000000000 65535 f \n";
  for (let i = 1; i <= imgId; i++) table += String(xref[i] || 0).padStart(10, "0") + " 00000 n \n";
  push(table);
  push(`trailer << /Size ${imgId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
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
  const pg = Page();
  const docType = String(data.docType || "INVOICE").toUpperCase();
  const isEstimate = docType === "ESTIMATE";
  const company = data.company || {};
  const subtotal = data.subtotal != null ? Number(data.subtotal) : (data.lines || []).reduce((s, l) => s + Number(l.amount || 0), 0);
  const tax = Number(data.tax || 0);
  const total = data.total != null ? Number(data.total) : subtotal + tax;
  const payment = Number(data.payment || 0);

  // Raise body toward logo (~20pt) so more room remains at the bottom.
  const LIFT = 20;
  const titleY = 164.25 - LIFT;
  const metaY = 186 - LIFT;
  const customY = 241.5 - LIFT;
  const tableTop = 270.75 - LIFT;

  // Header — company block + logo (license sits under email, not next to name)
  pg.text(M, 46.5, company.name || "", { size: 10.98, bold: true, color: BLACK });
  const details = [
    ...(company.addressLines || []),
    company.phone,
    company.email,
    company.license,
  ].filter(Boolean);
  details.forEach((ln, i) => pg.text(M, 61.5 + i * 12.75, ln, { size: 7.32, color: BLACK }));
  pg.image("ImLogo", 254.25, 36, 103.5, 81);

  // Title "INVOICE"/"ESTIMATE" top-right (green) — Levi layout preference
  pg.text(PAGE_W - M, titleY, docType, { size: 13.72, color: GREEN, align: "right" });

  // Meta left: ADDRESS
  pg.text(M, metaY, "ADDRESS", { size: 9.15, color: GRAY });
  let ly = metaY + 13.5;
  for (const ln of [data.billTo?.name, ...(data.billTo?.addressLines || [])].filter(Boolean)) {
    pg.text(M, ly, ln, { size: 9.15, color: BLACK });
    ly += 14.25;
  }
  // Meta right: doc no + dates
  const rightRows = [[docType, data.docNumber], ["DATE", data.date]];
  if (!isEstimate && data.dueDate) rightRows.push(["DUE DATE", data.dueDate]);
  if (!isEstimate && data.terms) rightRows.push(["TERMS", data.terms]);
  let ry = metaY;
  for (const [label, value] of rightRows) {
    pg.text(396.45, ry, label, { size: 9.15, color: GRAY });
    pg.text(477.23, ry, String(value ?? ""), { size: 9.15, color: BLACK });
    ry += 13.5;
  }
  // Custom fields (SERVICE ADDRESS)
  if (data.customFields && data.customFields.length) {
    const colXs = [36, 237.68, 435.61];
    data.customFields.slice(0, 3).forEach((cf, i) => {
      if (!cf || !cf.value) return;
      pg.text(colXs[i], customY, String(cf.label).toUpperCase(), { size: 9.15, color: GRAY });
      pg.text(colXs[i], customY + 12, String(cf.value), { size: 9.15, color: BLACK });
    });
  }

  // Table header band + labels (green)
  pg.fillRect(M, tableTop, 540, 21, HEADERBG);
  const hb = tableTop + 14.25;
  pg.text(39.75, hb, "DESCRIPTION", { size: 9.15, color: GREEN });
  pg.text(448.4, hb, "RATE", { size: 9.15, color: GREEN, align: "right" });
  pg.text(491.6, hb, "QTY", { size: 9.15, color: GREEN, align: "right" });
  pg.text(572.6, hb, "AMOUNT", { size: 9.15, color: GREEN, align: "right" });

  // Rows
  const descTextX = 39.75;
  const descW = 396.5 - 39.75;
  const LEAD = 13.5;
  let cursor = tableTop + 21;
  if (data.serviceDate) {
    cursor += 7.5;
    pg.text(descTextX, cursor + 10.75, String(data.serviceDate), { size: 10.07, color: BLACK });
    cursor += LEAD;
  }
  for (const line of data.lines || []) {
    cursor += 7.5;
    const dlines = wrap(line.description, descW, 10.07);
    const rowH = dlines.length * LEAD;
    const firstBaseline = cursor + 10.75;
    dlines.forEach((dl, i) => pg.text(descTextX, firstBaseline + i * LEAD, dl, { size: 10.07, color: BLACK }));
    pg.text(448.4, firstBaseline, qbMoney(line.rate), { size: 10.07, color: BLACK, align: "right" });
    pg.text(491.6, firstBaseline, String(Number(line.qty)), { size: 10.07, color: BLACK, align: "right" });
    pg.text(572.6, firstBaseline, qbMoney(line.amount), { size: 10.07, color: BLACK, align: "right" });
    cursor += rowH;
  }

  // Totals + message block
  const totalsTop = cursor + 11.25;
  pg.dottedRule(M, M + 540, totalsTop);

  // Message lines: payment options sit left of totals; thank-you / sincerely
  // start BELOW Balance Due with breathing room (Levi 2026-07-21).
  let paymentMsg = null;
  let closingMsg = null;
  if (data.messageLines !== null) {
    // Fallback copy only — callers normally pass data.messageLines. Built from
    // tenant config so a white-label tenant never sees another tenant's name.
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

  // SUBTOTAL / TAX / PAYMENT
  let ty = totalsTop + 22.5;
  const totalRows = [["SUBTOTAL", qbMoney(subtotal)], ["TAX", qbMoney(tax)]];
  if (payment) totalRows.push(["PAYMENT", "-" + qbMoney(payment)]);
  for (const [label, value] of totalRows) {
    pg.text(298.96, ty, label, { size: 10.07, color: GRAY });
    pg.text(572.6, ty, value, { size: 10.07, color: BLACK, align: "right" });
    ty += 21;
  }
  // rule above TOTAL (right side only)
  pg.dottedRule(295.5, M + 540, ty - 21 + 10.5);
  ty += 13.5;
  const bigLabel = data.totalLabel || (isEstimate ? "TOTAL" : "BALANCE DUE");
  const bigAmount = payment ? total - payment : total;
  pg.text(298.96, ty, bigLabel, { size: 10.07, color: GRAY });
  pg.text(572.6, ty, "$" + qbMoney(bigAmount), { size: 14.09, bold: true, color: BLACK, align: "right" });

  // Thank-you / sincerely — below Balance Due with a clear gap
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

  // Acceptance (estimates)
  const showAcceptance = data.showAcceptance != null ? data.showAcceptance : isEstimate;
  if (showAcceptance) {
    pg.text(M, ty + 54, "Accepted By", { size: 9.15, color: GRAY });
    pg.text(M, ty + 81, "Accepted Date", { size: 9.15, color: GRAY });
  }

  // Centered footer (questions + page). Thank-you spacing after Balance Due is
  // handled in the left message block above — keep footer at the page margin.
  const fLines =
    data.footerLines || [
      "Thank you for your business!",
      "",
      `If you have any questions concerning this ${docType.toLowerCase()} please contact us.`,
      `Phone: ${company.phone} Email: ${company.email}`,
    ];
  pg.center(fLines[0], 706, { size: 10, color: GRAY });
  let fy = 734;
  for (const l of fLines.slice(2)) {
    pg.center(l, fy, { size: 10, color: GRAY });
    fy += 14;
  }
  pg.center("Page 1 of 1", fy, { size: 10, color: GRAY });
  // Constant product mark under the tenant's own footer — muted dark, not the
  // near-invisible body gray, so it stays legible on white and in print.
  pg.center(POWERED_BY_LE, fy + 14, {
    size: POWERED_BY_LE_PDF_SIZE,
    color: POWERED_BY_LE_PDF_COLOR,
  });

  const image = { name: "ImLogo", width: LE_LOGO_JPEG.width, height: LE_LOGO_JPEG.height, bytes: leLogoJpegBytes() };
  return new Blob([assemblePdf(pg, image)], { type: "application/pdf" });
}
