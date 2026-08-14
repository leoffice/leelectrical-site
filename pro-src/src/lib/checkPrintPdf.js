// BLZ Electric business-check PRINT (front only) — standard professional US
// business-check layout on BLZ's own Chase account, generated as a print-ready
// PDF. Same zero-dependency byte-writer style as letterheadPdf / qbInvoicePdf.
//
// Guardrails (match the standalone generator + skill):
//   * Generic professional design — the drawee bank is stated factually as text
//     ("JPMorgan Chase Bank, N.A."); NO Chase logo, wordmark, or artwork.
//   * Signature is auto-embedded by default (Levi's LE signature JPEG).
//     Pass { signed: false } for a blank signature line (hand-sign).
//   * Front of the check only — no deposit/endorsement back page.
//   * BLZ's own account only (flagship/internal tenant gates the UI).
//
// The bottom MICR line is drawn in genuine E-13B glyph geometry (vector rects)
// at the correct 0.130" pitch band — not a monospace substitute.
import { ADVANCE, BODY_HEIGHT, GLYPHS, micrLine, micrDigits } from "./e13bGlyphs.js";
import { leSignatureImage } from "./leSignatureJpeg.js";

const PAGE_W = 612;
const PAGE_H = 792;
const IN = 72;

const INK = [0.06, 0.06, 0.09];
const GREY = [0.42, 0.42, 0.46];
const FAINT = [0.62, 0.62, 0.66];
const BLACK = [0, 0, 0];

// BLZ's own account (prints on every check they issue — not secret).
export const BLZ_CHECK = {
  name: "BLZ Electric Inc.",
  addr1: "1243 E 15th Street",
  addr2: "Brooklyn, NY 11230",
  phone: "(718) 594-1850",
  bank: "JPMorgan Chase Bank, N.A.",
  routing: "021000021",
  account: "606031220",
  fractional: "1-12/210",
  startCheckNo: 1001,
};

// ── amount → words ─────────────────────────────────────────────────────────
const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + under1000(n % 100) : "");
}

/** 397.5 → "Three hundred ninety-seven and 50/100". */
export function amountToWords(amount) {
  const cents = Math.round(Number(amount) * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  let words;
  if (!dollars) {
    words = "zero";
  } else {
    const parts = [];
    let r = dollars;
    for (const [scale, label] of [[1_000_000_000, "billion"], [1_000_000, "million"], [1_000, "thousand"]]) {
      if (r >= scale) {
        parts.push(under1000(Math.floor(r / scale)) + " " + label);
        r %= scale;
      }
    }
    if (r) parts.push(under1000(r));
    words = parts.join(" ");
  }
  words = words.charAt(0).toUpperCase() + words.slice(1);
  return `${words} and ${String(rem).padStart(2, "0")}/100`;
}

// ── minimal PDF byte-writer (Helvetica / Helvetica-Bold) ────────────────────
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELVB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const FONTS = { F1: HELV, F2: HELVB };

const r2 = (n) => Math.round(n * 100) / 100;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function latin1(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function textWidth(str, size, font = "F1") {
  const t = FONTS[font] || HELV;
  const s = String(str == null ? "" : str);
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c > 126 || c < 32) c = 63;
    w += t[c - 32] || 500;
  }
  return (w / 1000) * size;
}

function Page() {
  const ops = [];
  const api = {
    // baselineY measured from the TOP of the page.
    text(x, baselineY, str, { size = 10, font = "F1", color = INK, align = "left" } = {}) {
      const s = String(str == null ? "" : str);
      let tx = x;
      const w = textWidth(s, size, font);
      if (align === "right") tx = x - w;
      if (align === "center") tx = x - w / 2;
      ops.push(`${r2(color[0])} ${r2(color[1])} ${r2(color[2])} rg`);
      ops.push(`BT /${font} ${size} Tf 1 0 0 1 ${r2(tx)} ${r2(PAGE_H - baselineY)} Tm (${esc(s)}) Tj ET`);
      return w;
    },
    fillRect(x, topY, w, h, color = INK) {
      ops.push(`${r2(color[0])} ${r2(color[1])} ${r2(color[2])} rg ${r2(x)} ${r2(PAGE_H - topY - h)} ${r2(w)} ${r2(h)} re f`);
    },
    strokeRect(x, topY, w, h, color = INK, width = 1) {
      ops.push(`${r2(color[0])} ${r2(color[1])} ${r2(color[2])} RG ${r2(width)} w ${r2(x)} ${r2(PAGE_H - topY - h)} ${r2(w)} ${r2(h)} re S`);
    },
    rule(x1, x2, topY, color = INK, width = 1) {
      const y = PAGE_H - topY;
      ops.push(`${r2(color[0])} ${r2(color[1])} ${r2(color[2])} RG ${r2(width)} w ${r2(x1)} ${r2(y)} m ${r2(x2)} ${r2(y)} l S`);
    },
    image(name, x, topY, w, h) {
      ops.push(`q ${r2(w)} 0 0 ${r2(h)} ${r2(x)} ${r2(PAGE_H - topY - h)} cm /${name} Do Q`);
    },
    stream: () => ops.join("\n"),
  };
  return api;
}

function assemblePdf(page, images) {
  const imgs = (images || []).filter((im) => im && im.bytes && im.bytes.length && im.name);
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

  const stream = page.stream();
  const xobjEntries = imgs.map((im, i) => `/${im.name} ${7 + i} 0 R`).join(" ");
  const xobjs = imgs.length ? ` /XObject << ${xobjEntries} >>` : "";
  obj(1, "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  obj(2, "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n");
  obj(
    3,
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >>${xobjs} >> >> endobj\n`
  );
  obj(4, `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`);
  obj(5, "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n");
  obj(6, "6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj\n");

  imgs.forEach((im, i) => {
    const id = 7 + i;
    obj(
      id,
      `${id} 0 obj << /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >> stream\n`
    );
    push(im.bytes);
    push("\nendstream\nendobj\n");
  });

  const maxId = imgs.length ? 6 + imgs.length : 6;
  const xrefStart = offset;
  push(`xref\n0 ${maxId + 1}\n`);
  push("0000000000 65535 f \n");
  for (let i = 1; i <= maxId; i++) push(String(xref[i] || 0).padStart(10, "0") + " 00000 n \n");
  push(`trailer << /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Today's date as MM/DD/YYYY (local timezone). */
export function todayCheckDate(now = new Date()) {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Normalize typed check dates:
 *   08142026 → 08/14/2026
 *   081426   → 08/14/2026
 *   8/14/26  → 08/14/2026
 * Empty → today.
 */
export function normalizeCheckDate(raw, now = new Date()) {
  let s = String(raw == null ? "" : raw).trim();
  if (!s) return todayCheckDate(now);
  // Already has separators
  const sep = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (sep) {
    const mm = sep[1].padStart(2, "0");
    const dd = sep[2].padStart(2, "0");
    let yyyy = sep[3];
    if (yyyy.length === 2) yyyy = "20" + yyyy;
    return `${mm}/${dd}/${yyyy}`;
  }
  const dig = s.replace(/\D/g, "");
  if (/^\d{8}$/.test(dig)) {
    // MMDDYYYY
    return `${dig.slice(0, 2)}/${dig.slice(2, 4)}/${dig.slice(4)}`;
  }
  if (/^\d{6}$/.test(dig)) {
    // MMDDYY
    return `${dig.slice(0, 2)}/${dig.slice(2, 4)}/20${dig.slice(4)}`;
  }
  return s;
}

// ── MICR band (E-13B vector glyphs) ─────────────────────────────────────────
function drawMicr(pg, text, xLeftPt, baselineTopY, pitchPt = 0.13 * IN) {
  const scale = pitchPt / ADVANCE; // uniform — preserves authored proportions
  let pen = xLeftPt;
  for (const ch of text) {
    if (ch === " ") {
      pen += ADVANCE * scale;
      continue;
    }
    const rects = GLYPHS[ch];
    if (rects) {
      for (const [rx, ry, rw, rh] of rects) {
        pg.fillRect(pen + rx * scale, baselineTopY - (ry + rh) * scale, rw * scale, rh * scale, BLACK);
      }
    }
    pen += ADVANCE * scale;
  }
  return pen - xLeftPt; // printed width (pt)
}

// ── the check ───────────────────────────────────────────────────────────────
/**
 * Build a print-ready BLZ business-check PDF (front only).
 * @param {object} o
 * @param {string} [o.payee]  pay-to-the-order-of name
 * @param {number|string} [o.amount]  numeric dollars (e.g. 397.50)
 * @param {string} [o.date]   date text (normalized; empty → today)
 * @param {number|string} [o.checkNo]  check number
 * @param {string} [o.memo]
 * @param {boolean} [o.sample]  overlay a faint non-negotiable SAMPLE mark
 * @param {boolean} [o.signed=true]  embed Levi's signature above the line
 * @param {object} [o.signatureImage]  optional PDF image; defaults to LE signature
 * @param {object} [o.config]  override BLZ_CHECK fields
 * @returns {Uint8Array} PDF bytes
 */
export function buildCheckPdf({
  payee = "",
  amount = null,
  date = "",
  checkNo,
  memo = "",
  sample = false,
  signed = true,
  signatureImage,
  config,
} = {}) {
  const raw = { ...BLZ_CHECK, ...(config || {}) };
  // Human-facing fields as typed; MICR always digit-only so any saved account prints.
  const cfg = {
    ...raw,
    routing: micrDigits(raw.routing) || BLZ_CHECK.routing,
    account: micrDigits(raw.account) || BLZ_CHECK.account,
  };
  const chkNo = micrDigits(checkNo != null && checkNo !== "" ? checkNo : raw.startCheckNo) || "1001";
  const dateStr = normalizeCheckDate(date);
  const pg = Page();
  const images = [];
  let sigImage = null;
  if (signed !== false) {
    try {
      sigImage = signatureImage && signatureImage.bytes ? signatureImage : leSignatureImage();
      if (sigImage?.bytes?.length) images.push(sigImage);
      else sigImage = null;
    } catch {
      sigImage = null;
    }
  }

  // Standard US business check: 8.0" × 3.5" on letter page (8.5" × 11").
  // Centered horizontally AND vertically so top and bottom margins match
  // (Levi 2026-08-14 — clear edge, not stuck at the top of the sheet).
  const CHECK_W = 8.0 * IN;
  const CHECK_H = 3.5 * IN;
  const L = (PAGE_W - CHECK_W) / 2; // 0.25"
  const R = L + CHECK_W;
  const CT = (PAGE_H - CHECK_H) / 2; // equal top/bottom white space
  const CB = CT + CHECK_H;
  const cx = (L + R) / 2;

  // Black border so the check edge is obvious when printing (no black fill
  // outside the check — only the outline).
  pg.strokeRect(L, CT, CHECK_W, CHECK_H, BLACK, 1.6);
  // Inner microprint frame stays soft grey (security look, not a second heavy border)
  const micro = "BLZ ELECTRIC INC  ORIGINAL DOCUMENT  ".repeat(6);
  pg.text(L + 3, CT + 8, micro.slice(0, 96), { size: 2.6, color: [0.72, 0.72, 0.76] });
  pg.text(L + 3, CB - 4, micro.slice(0, 96), { size: 2.6, color: [0.72, 0.72, 0.76] });

  // company block (top-left)
  pg.text(L + 14, CT + 24, cfg.name, { size: 15, font: "F2", color: INK });
  pg.rule(L + 14, L + 14 + 184, CT + 29, INK, 1);
  pg.text(L + 14, CT + 44, cfg.addr1, { size: 9.5, color: GREY });
  pg.text(L + 14, CT + 57, cfg.addr2, { size: 9.5, color: GREY });
  if (cfg.phone) pg.text(L + 14, CT + 70, cfg.phone, { size: 9.5, color: GREY });

  // drawee bank of record (factual text, centered; NO logo)
  pg.text(cx, CT + 44, cfg.bank, { size: 10.5, color: INK, align: "center" });

  // check number (top-right) + routing fraction
  pg.text(R - 14, CT + 30, chkNo, { size: 20, font: "F2", color: INK, align: "right" });
  if (cfg.fractional) pg.text(R - 14, CT + 45, cfg.fractional, { size: 8, color: GREY, align: "right" });

  // date field
  pg.text(R - 152, CT + 70, "DATE", { size: 8.5, font: "F2", color: GREY });
  pg.rule(R - 122, R - 14, CT + 72, INK, 0.9);
  if (dateStr) pg.text(R - 116, CT + 68, String(dateStr), { size: 11, color: INK });

  // pay to the order of
  const payY = CT + 112;
  pg.text(L + 14, payY - 4, "PAY TO THE", { size: 8, font: "F2", color: GREY });
  pg.text(L + 14, payY + 6, "ORDER OF", { size: 8, font: "F2", color: GREY });
  pg.rule(L + 82, R - 126, payY + 4, INK, 1.1);
  if (payee) pg.text(L + 90, payY + 1, String(payee), { size: 13, color: INK });

  // numeric amount box
  const bx0 = R - 121;
  const bx1 = R - 14;
  const boxTop = payY - 14;
  const boxH = 26;
  pg.strokeRect(bx0, boxTop, bx1 - bx0, boxH, INK, 1.2);
  pg.text(bx0 + 5, payY + 2, "$", { size: 14, font: "F2", color: INK });
  if (amount != null && amount !== "") {
    pg.text(bx1 - 6, payY + 2, Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), {
      size: 14, font: "F2", color: INK, align: "right",
    });
  }

  // written amount line + DOLLARS
  const wordsY = CT + 148;
  if (amount != null && amount !== "") pg.text(L + 16, wordsY - 2, amountToWords(amount), { size: 12, color: INK });
  pg.rule(L + 14, R - 76, wordsY + 3, INK, 1.1);
  pg.text(R - 14, wordsY - 2, "DOLLARS", { size: 9, font: "F2", color: GREY, align: "right" });

  // memo + signature (auto-signed by default)
  const sigY = CB - 68;
  pg.text(L + 14, sigY + 2, "MEMO", { size: 8, font: "F2", color: GREY });
  pg.rule(L + 54, L + 260, sigY + 4, INK, 0.9);
  if (memo) pg.text(L + 62, sigY - 1, String(memo), { size: 10, color: INK });
  const sigLineL = R - 224;
  const sigLineR = R - 14;
  pg.rule(sigLineL, sigLineR, sigY + 4, INK, 0.9);
  if (sigImage) {
    const maxW = 150;
    const maxH = 42;
    let w = maxW;
    let h = (sigImage.height / sigImage.width) * w;
    if (h > maxH) {
      h = maxH;
      w = (sigImage.width / sigImage.height) * h;
    }
    const sigX = sigLineR - w - 6;
    const sigTop = sigY + 4 - h - 2;
    pg.image(sigImage.name, sigX, sigTop, w, h);
  }
  pg.text(R - 14, sigY + 18, "AUTHORIZED SIGNATURE", { size: 7.5, color: GREY, align: "right" });

  // optional faint non-negotiable SAMPLE mark (app generates real checks w/o it)
  if (sample) {
    pg.text(cx, (CT + CB) / 2, "SAMPLE - NON-NEGOTIABLE", { size: 30, font: "F2", color: [0.9, 0.72, 0.72], align: "center" });
  }

  // MICR band (E-13B), centered near the check bottom — always uses digit-only
  // routing/account/check# from the selected funding account (change/save-safe).
  const micr = micrLine(cfg.routing, cfg.account, chkNo);
  // Only advance for characters we can draw (skip unknown so pitch stays tight).
  let micrCells = 0;
  for (const ch of micr) {
    if (ch === " " || GLYPHS[ch]) micrCells += 1;
  }
  const micrW = micrCells * ADVANCE * ((0.13 * IN) / ADVANCE);
  drawMicr(pg, micr, cx - micrW / 2, CB - 0.34 * IN);

  pg.text(L + 14, CB - 10, "Void after 90 days.  Security features on original.", { size: 6.5, color: FAINT });

  return assemblePdf(pg, images);
}

/** Convenience: build a Blob for download/preview. */
export function buildCheckPdfBlob(opts) {
  return new Blob([buildCheckPdf(opts)], { type: "application/pdf" });
}
