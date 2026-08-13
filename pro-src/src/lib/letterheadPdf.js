// Professional letterhead PDF — approved 2026-08-10 redesign (letter-redesign
// candidates): logo top-left + right-aligned company block, green→lime accent
// bar, centered eyebrow + document title, serif body with justified text and
// **bold** highlights, real embedded signature + signer line always on, and a
// license footer band. Same zero-dep byte-writer style as descriptionPdf /
// qbInvoicePdf. White-label: company/logo/signer come from the tenant profile;
// the built-in LE signature only ever prints for the LE/BLZ flagship tenant.
import { resolvePdfLogoImageSync, jpegImageFromDataUrl, isLeCompanyTenant } from "./companyLogoPdf.js";
import { leSignatureImage } from "./leSignatureJpeg.js";
import { containSize, loadLetterPhotoImages } from "./letterPhotos.js";
import { tenantCompany, activeTenantConfig } from "./tenantBranding.js";
import { applySignature, resolveSigner } from "./signatureService.js";

const PAGE_W = 612;
const PAGE_H = 792;
const M = 54;
const GREEN = [6 / 255, 106 / 255, 52 / 255];
const LIME = [140 / 255, 198 / 255, 63 / 255];
const GRAY = [100 / 255, 104 / 255, 110 / 255];
const LIGHTGRAY = [148 / 255, 152 / 255, 158 / 255];
const BLACK = [0.08, 0.09, 0.1];
const RULE = [186 / 255, 190 / 255, 197 / 255];

// Standard 14-font AFM widths, chars 32..126.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELVB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const TIMES = [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541];
const TIMESB = [250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520];

const FONTS = {
  F1: HELV,
  F2: HELVB,
  F3: TIMES,
  F4: TIMESB,
};
// Widths for the WinAnsi high-bytes esc() emits (·, ’, –, —), per font.
// Keyed by the WinAnsi BYTE, so callers must normalize before lookup — passing
// raw Unicode (— = U+2014) missed the table and mis-advanced the next word.
const HIGH_W = {
  F1: { 0xb7: 278, 0x92: 222, 0x96: 556, 0x97: 1000 },
  F2: { 0xb7: 278, 0x92: 238, 0x96: 556, 0x97: 1000 },
  F3: { 0xb7: 250, 0x92: 333, 0x96: 500, 0x97: 1000 },
  F4: { 0xb7: 250, 0x92: 333, 0x96: 500, 0x97: 1000 },
};

function textWidth(str, size, font = "F1", tracking = 0) {
  const t = FONTS[font] || HELV;
  const high = HIGH_W[font] || HIGH_W.F1;
  let w = 0;
  // Measure exactly what esc() will write, not the raw input.
  const s = toWinAnsi(str);
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c > 126) {
      w += high[c] || 500;
      continue;
    }
    if (c < 32) c = 63;
    w += t[c - 32] || 500;
  }
  return (w / 1000) * size + tracking * Math.max(0, s.length - 1);
}

/** Map Unicode punctuation to WinAnsi bytes; everything else non-ASCII → "?". */
function toWinAnsi(s) {
  return String(s == null ? "" : s)
    .replace(/·|•/g, "\xb7")
    .replace(/’|‘|ʼ/g, "\x92")
    .replace(/“|”/g, '"')
    .replace(/–/g, "\x96")
    .replace(/—/g, "\x97")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7e\x92\x96\x97\xb7]/g, "?");
}

function esc(s) {
  return toWinAnsi(s)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

const r2 = (n) => Math.round(n * 100) / 100;

function latin1(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function Page() {
  const ops = [];
  const text = (
    x,
    baselineY,
    str,
    { size = 10, font = "F1", bold = false, color = BLACK, align = "left", tracking = 0 } = {}
  ) => {
    // Back-compat: `bold` without an explicit serif font means Helvetica-Bold.
    let f = font;
    if (bold && (font === "F1" || font === "F3")) f = font === "F3" ? "F4" : "F2";
    const s = toWinAnsi(str);
    let tx = x;
    const w = textWidth(s, size, f, tracking);
    if (align === "right") tx = x - w;
    if (align === "center") tx = x - w / 2;
    ops.push(`${r2(color[0])} ${r2(color[1])} ${r2(color[2])} rg`);
    const tc = tracking ? ` ${r2(tracking)} Tc` : "";
    ops.push(
      `BT /${f} ${size} Tf${tc} 1 0 0 1 ${r2(tx)} ${r2(PAGE_H - baselineY)} Tm (${esc(s)}) Tj${tracking ? " 0 Tc" : ""} ET`
    );
    return w;
  };
  return {
    text,
    fillRect(x, topY, w, h, color) {
      ops.push(
        `${r2(color[0])} ${r2(color[1])} ${r2(color[2])} rg ${r2(x)} ${r2(PAGE_H - topY - h)} ${r2(w)} ${r2(h)} re f`
      );
    },
    rule(x1, x2, topY, color = RULE, width = 0.6) {
      const y = PAGE_H - topY;
      ops.push(
        `${r2(color[0])} ${r2(color[1])} ${r2(color[2])} RG ${r2(width)} w ${r2(x1)} ${r2(y)} m ${r2(x2)} ${r2(y)} l S`
      );
    },
    image(name, x, topY, w, h) {
      ops.push(`q ${r2(w)} 0 0 ${r2(h)} ${r2(x)} ${r2(PAGE_H - topY - h)} cm /${name} Do Q`);
    },
    stream: () => ops.join("\n"),
  };
}

/** Green→lime brand accent bar (the approved gradient, faked in segments). */
function accentBar(pg, x1, x2, topY, h = 3.4) {
  const SEGS = 28;
  const w = (x2 - x1) / SEGS;
  for (let i = 0; i < SEGS; i++) {
    const t = i / (SEGS - 1);
    const c = [
      GREEN[0] + (LIME[0] - GREEN[0]) * t,
      GREEN[1] + (LIME[1] - GREEN[1]) * t,
      GREEN[2] + (LIME[2] - GREEN[2]) * t,
    ];
    // +0.35 overlap so antialiasing seams never show as hairlines.
    pg.fillRect(x1 + i * w, topY, w + 0.35, h, c);
  }
}

function assemblePdf(pages, images) {
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

  const n = pages.length;
  const fontIds = { F1: 3 + n * 2, F2: 4 + n * 2, F3: 5 + n * 2, F4: 6 + n * 2 };
  const firstImgId = 7 + n * 2;

  const pageKids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  obj(1, "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  obj(2, `2 0 obj << /Type /Pages /Kids [${pageKids}] /Count ${n} >> endobj\n`);

  const xobjEntries = imgs.map((im, i) => `/${im.name} ${firstImgId + i} 0 R`).join(" ");
  const fontEntries = Object.entries(fontIds)
    .map(([k, id]) => `/${k} ${id} 0 R`)
    .join(" ");

  for (let i = 0; i < n; i++) {
    const pageObj = 3 + i * 2;
    const contentObj = 4 + i * 2;
    const stream = pages[i].stream();
    const xobjs = imgs.length ? ` /XObject << ${xobjEntries} >>` : "";
    obj(
      pageObj,
      `${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentObj} 0 R /Resources << /Font << ${fontEntries} >>${xobjs} >> >> endobj\n`
    );
    obj(contentObj, `${contentObj} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`);
  }

  const baseFonts = { F1: "Helvetica", F2: "Helvetica-Bold", F3: "Times-Roman", F4: "Times-Bold" };
  for (const [k, id] of Object.entries(fontIds)) {
    obj(
      id,
      `${id} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /${baseFonts[k]} /Encoding /WinAnsiEncoding >> endobj\n`
    );
  }

  imgs.forEach((im, i) => {
    const id = firstImgId + i;
    obj(
      id,
      `${id} 0 obj << /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >> stream\n`
    );
    push(im.bytes);
    push("\nendstream\nendobj\n");
  });

  const maxId = imgs.length ? firstImgId + imgs.length - 1 : fontIds.F4;
  const xrefStart = offset;
  push(`xref\n0 ${maxId + 1}\n`);
  push("0000000000 65535 f \n");
  for (let i = 1; i <= maxId; i++) {
    push(String(xref[i] || 0).padStart(10, "0") + " 00000 n \n");
  }
  push(`trailer << /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/**
 * Bare license number — prod profiles store values like "Lic #11212", and the
 * header/footer add their own "License #"/"Lic #" prefix (Levi's screenshot
 * showed "Lic. Lic #11212"). Strip any existing prefix before printing.
 */
function licenseNo(license) {
  return String(license || "").replace(/^\s*(?:lic(?:ense)?\.?\s*#?\s*)+/i, "").trim();
}

function formatDate(d = new Date()) {
  try {
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/* ---------------------------- body layout ---------------------------- */

/**
 * Tokenize paragraph text with **bold** spans into styled words.
 * @returns {Array<{ t: string, bold: boolean }>}
 */
function styledWords(text) {
  const words = [];
  const parts = String(text || "").split(/\*\*/);
  for (let i = 0; i < parts.length; i++) {
    const bold = i % 2 === 1;
    for (const w of parts[i].split(/\s+/)) {
      if (!w) continue;
      // Glue bare punctuation (the tail after a **bold** span) onto the
      // previous word so "…NY 11213**." never renders as "11213 .".
      if (/^[.,;:!?)\]%]+$/.test(w) && words.length) {
        words[words.length - 1] = {
          ...words[words.length - 1],
          t: words[words.length - 1].t + w,
        };
        continue;
      }
      words.push({ t: w, bold });
    }
  }
  return words;
}

/** Greedy-wrap styled words into lines that fit maxW at the given size. */
function layoutParagraph(text, maxW, size) {
  const spaceW = (250 / 1000) * size; // Times space
  const words = styledWords(text).map((w) => ({
    ...w,
    w: textWidth(w.t, size, w.bold ? "F4" : "F3"),
  }));
  const lines = [];
  let cur = [];
  let curW = 0;
  for (const w of words) {
    const add = (cur.length ? spaceW : 0) + w.w;
    if (cur.length && curW + add > maxW) {
      lines.push({ words: cur, width: curW });
      cur = [w];
      curW = w.w;
    } else {
      cur.push(w);
      curW += add;
    }
  }
  if (cur.length) lines.push({ words: cur, width: curW });
  lines.forEach((ln, i) => {
    ln.last = i === lines.length - 1;
  });
  return { lines, spaceW };
}

/** Draw one wrapped line, justified unless it is a paragraph's last line. */
function drawBodyLine(pg, x, y, line, spaceW, maxW, size, justify) {
  const gaps = line.words.length - 1;
  const extra = justify && !line.last && gaps > 0 ? Math.max(0, (maxW - line.width) / gaps) : 0;
  // Cap justification stretch so short widow lines don't explode.
  const pad = extra > spaceW * 2.2 ? 0 : extra;
  let cx = x;
  for (const w of line.words) {
    pg.text(cx, y, w.t, { size, font: w.bold ? "F4" : "F3", color: BLACK });
    cx += w.w + spaceW + pad;
  }
}

/* ------------------------- letterhead pieces ------------------------- */

const TYPE_HEADINGS = {
  load_letter: { eyebrow: "AFFIDAVIT  ·  ELECTRICAL LOAD TEST", title: "LOAD LETTER" },
  equipment_safety_inspection: {
    eyebrow: "AFFIDAVIT  ·  STATEMENT OF INSPECTION",
    title: "EQUIPMENT SAFETY INSPECTION",
  },
  shared_meter_affidavit: {
    eyebrow: "AFFIDAVIT  ·  SHARED METER CONDITION",
    title: "AFFIDAVIT",
    subtitle: "Statement Regarding Shared Meter Condition",
  },
  work_confirmation: {
    eyebrow: "COMPLIANCE  ·  CONFIRMATION OF COMPLETED WORK",
    title: "WORK CONFIRMATION",
  },
};

/** Company header (page 1) — logo left, company block right, accent bar. */
function drawCompanyHeader(pg, company, profile, logo) {
  const topY = 34;
  if (logo && logo.name) {
    const logoH = 46;
    const ratio = logo.width && logo.height ? logo.width / logo.height : 1.28;
    const logoW = Math.min(110, ratio * logoH);
    pg.image(logo.name, M, topY, logoW, logoH);
  }
  const rx = PAGE_W - M;
  pg.text(rx, 47, company.name || "Company", { size: 15, font: "F4", color: GREEN, align: "right" });
  const tagline = isLeCompanyTenant()
    ? "LICENSED & INSURED ELECTRICAL CONTRACTOR"
    : String(profile?.letterheadTagline || "").toUpperCase();
  if (tagline) {
    pg.text(rx, 60, tagline, { size: 6.4, font: "F1", color: GREEN, tracking: 1.5, align: "right" });
  }
  let y = 73;
  const addr = [company.street, company.cityStateZip].filter(Boolean).join("  ·  ");
  if (addr) {
    pg.text(rx, y, addr, { size: 7.6, color: GRAY, align: "right" });
    y += 11;
  }
  const web = String(profile?.website || "").trim();
  const contact = [company.phone, company.email, web].filter(Boolean).join("  ·  ");
  if (contact) {
    pg.text(rx, y, contact, { size: 7.6, color: GRAY, align: "right" });
    y += 11;
  }
  if (company.license) {
    pg.text(rx, y, "License #" + licenseNo(company.license), { size: 7.6, color: GRAY, align: "right" });
    y += 11;
  }
  const barY = Math.max(92, y + 6);
  accentBar(pg, M, PAGE_W - M, barY);
  return barY + 3.4;
}

/** License footer band, every page. */
function drawFooter(pg, company, profile) {
  pg.rule(M, PAGE_W - M, 756, RULE, 0.5);
  const web = String(profile?.website || "").trim();
  const bits = [
    company.name,
    company.license ? "Lic #" + licenseNo(company.license) : "",
    [company.street, company.cityStateZip].filter(Boolean).join(", "),
    company.phone,
    company.email,
    web,
  ].filter(Boolean);
  pg.text(PAGE_W / 2, 770, bits.join("  ·  "), {
    size: 6.8,
    color: LIGHTGRAY,
    align: "center",
  });
}

/** Gray label + black value meta line; returns nothing (fixed lead handled by caller). */
function metaLine(pg, x, y, label, value, { valueBold = false } = {}) {
  const lw = pg.text(x, y, label + " ", { size: 10, font: "F3", color: GRAY });
  pg.text(x + lw + 2, y, value, { size: 10.5, font: valueBold ? "F4" : "F3", color: BLACK });
}

/* ------------------------------ builder ------------------------------ */

/**
 * Build letterhead PDF bytes from a letter draft + optional company override.
 * @param {object} opts
 * @param {object} opts.draft — LetterDraft
 * @param {object} [opts.company] — override tenantCompany()
 * @param {string} [opts.signerName]
 * @param {string} [opts.signerTitle]
 * @returns {Uint8Array}
 */
export function buildLetterheadPdf({
  draft,
  company: companyOverride,
  signerName,
  signerTitle,
  profile: profileOverride,
  photoImages,
} = {}) {
  const company = companyOverride || tenantCompany();
  const profile = profileOverride || activeTenantConfig()?.profile || null;
  const personal = (draft?.letterhead || "") === "personal";
  const logo = personal ? null : resolvePdfLogoImageSync();
  const signer = resolveSigner(profile, draft?.ownerId);
  const sigApply = applySignature({ profile, ownerId: draft?.ownerId || signer?.id });

  // Approved 2026-08-10 redesign: the signer line ("Levi Kumer, President")
  // is ALWAYS on for company letters — supersedes the 2026-08-04 company-only
  // sign-off (profile.letterSignatureMode is intentionally no longer read).
  let resolvedSignerName =
    signerName ||
    (personal ? draft?.answers?.ownerName || signer?.fullName : signer?.fullName) ||
    company.name ||
    "";
  let resolvedTitle = signerTitle || (personal ? "" : signer?.title || "President");
  // LE flagship guarantee: prod profiles without owners fall back to a generic
  // seed ("Authorized Signer" / the company name) — the approved letters must
  // always carry "Levi Kumer, President". Only for the LE/BLZ tenant.
  if (!personal && !signerName && isLeCompanyTenant()) {
    const generic =
      !resolvedSignerName ||
      /^authorized signer$/i.test(resolvedSignerName) ||
      resolvedSignerName === company.name ||
      (profile?.shortName && resolvedSignerName === profile.shortName);
    if (generic) {
      resolvedSignerName = "Levi Kumer";
      resolvedTitle = signerTitle || "President";
    }
  }

  // Signature image: tenant-registered (JPEG data URL) wins; the built-in LE
  // signature only for the LE/BLZ flagship; personal letters stay typed-only.
  let sigImage = null;
  if (!personal) {
    if (sigApply?.dataUrl) {
      const jpeg = jpegImageFromDataUrl(sigApply.dataUrl);
      if (jpeg) sigImage = { ...jpeg, name: "ImSig" };
    }
    if (!sigImage && isLeCompanyTenant()) sigImage = leSignatureImage();
  }

  const maxBodyW = PAGE_W - M * 2;
  const bodySize = 10.6;
  const bodyLead = 16.2;
  const bodyBottom = 736;

  // Paragraphs: blank-line separated; single newlines inside a paragraph are
  // soft breaks (address blocks) — kept as separate non-justified lines.
  const paragraphs = String(draft?.bodyText || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paragraphs.length) paragraphs.push("[No letter body yet]");

  const heading = TYPE_HEADINGS[draft?.typeId] || null;
  const a = draft?.answers || {};

  const pages = [];
  let pageNo = 0;
  let paraIdx = 0;
  let lineQueue = []; // wrapped lines of the current paragraph not yet drawn

  const nextParagraphLines = () => {
    const para = paragraphs[paraIdx];
    paraIdx += 1;
    const out = [];
    const pieces = String(para).split("\n").map((s) => s.trim()).filter(Boolean);
    for (const piece of pieces) {
      const { lines, spaceW } = layoutParagraph(piece, maxBodyW, bodySize);
      const justify = pieces.length === 1; // soft-break blocks stay ragged
      for (const ln of lines) out.push({ ...ln, spaceW, justify });
      if (out.length) out[out.length - 1].last = true;
    }
    if (out.length) out[out.length - 1].paraEnd = true;
    return out;
  };

  while (paraIdx < paragraphs.length || lineQueue.length || pages.length === 0) {
    pageNo += 1;
    const pg = Page();
    let y;

    if (personal) {
      y = 52;
      const oname = a.ownerName || signer?.fullName || resolvedSignerName || "";
      const oemail = a.ownerEmail || signer?.personalEmail || "";
      const ophone = a.ownerPhone || signer?.personalPhone || "";
      if (oname) {
        pg.text(M, y, oname, { size: 13, font: "F4", color: BLACK });
        y += 16;
      }
      if (oemail) {
        pg.text(M, y, oemail, { size: 10, color: GRAY });
        y += 13;
      }
      if (ophone) {
        pg.text(M, y, ophone, { size: 10, color: GRAY });
        y += 13;
      }
      pg.rule(M, PAGE_W - M, y + 4);
      y += 24;
    } else {
      const afterBar = drawCompanyHeader(pg, company, profile, logo);
      drawFooter(pg, company, profile);
      y = afterBar + 30;
    }

    if (pageNo === 1) {
      // Eyebrow + centered title (approved letter types), or plain title.
      if (!personal && heading) {
        pg.text(PAGE_W / 2, y, heading.eyebrow, {
          size: 7.6,
          font: "F1",
          color: GREEN,
          tracking: 2,
          align: "center",
        });
        y += 20;
        pg.text(PAGE_W / 2, y, heading.title, {
          size: 16,
          font: "F4",
          color: GREEN,
          tracking: 2.4,
          align: "center",
        });
        y += 8;
        pg.fillRect(PAGE_W / 2 - 32, y, 64, 1.8, LIME);
        y += 20;
        if (heading.subtitle) {
          pg.text(PAGE_W / 2, y, heading.subtitle, { size: 11, font: "F4", color: BLACK, align: "center" });
          y += 22;
        }
      } else if (
        !personal &&
        draft?.typeLabel &&
        draft.typeId !== "general" &&
        draft.typeId !== "owner_inspection_request"
      ) {
        pg.text(PAGE_W / 2, y, String(draft.typeLabel).toUpperCase(), {
          size: 13,
          font: "F4",
          color: GREEN,
          tracking: 1.6,
          align: "center",
        });
        y += 8;
        pg.fillRect(PAGE_W / 2 - 32, y, 64, 1.8, LIME);
        y += 20;
      }

      // Meta block
      metaLine(pg, M, y, "Date:", formatDate());
      y += 16;
      if (draft?.typeId === "load_letter" && (a.county || a.state)) {
        const cw = pg.text(M, y, "County of: ", { size: 10, font: "F3", color: GRAY });
        const vw = pg.text(M + cw + 2, y, a.county || "", { size: 10.5, font: "F3", color: BLACK });
        const sw = pg.text(M + cw + vw + 22, y, "State of: ", { size: 10, font: "F3", color: GRAY });
        pg.text(M + cw + vw + 22 + sw + 2, y, a.state || "New York", { size: 10.5, font: "F3", color: BLACK });
        y += 16;
      }

      const site = draft?.siteAddress || a.address || "";
      if (heading) {
        y += 4;
        if (draft?.reLine || site) {
          pg.text(M, y, "Re: " + (draft?.reLine && !/^statement regarding/i.test(draft.reLine) ? draft.reLine : site || draft?.reLine), {
            size: 10.8,
            font: "F4",
            color: BLACK,
          });
          y += 15;
        }
        if (draft?.typeId === "shared_meter_affidavit") {
          if (a.unit) {
            metaLine(pg, M, y, "Apt:", a.unit);
            y += 14;
          }
          if (a.accountNumber) {
            metaLine(pg, M, y, "Con Edison Account:", a.accountNumber);
            y += 14;
          }
        }
        if (draft?.typeId === "work_confirmation") {
          if (a.insured) {
            metaLine(pg, M, y, "Insured:", a.insured);
            y += 14;
          }
          if (a.policyNumber) {
            metaLine(pg, M, y, "Policy #:", a.policyNumber);
            y += 14;
          }
          if (a.recommendationRef) {
            metaLine(pg, M, y, "Reference:", a.recommendationRef);
            y += 14;
          }
        }
        y += 10;
        pg.text(M, y, "To Whom It May Concern,", { size: 10.8, font: "F4", color: BLACK });
        y += 22;
      } else {
        // Non-redesigned types keep the previous recipient logic on the new letterhead.
        const recipient =
          a.recipient ||
          (draft?.typeId === "good_standing_request"
            ? "New York State Department of State"
            : draft?.typeId === "owner_inspection_request"
              ? "NYC Department of Buildings"
              : "To Whom It May Concern");
        // Only print the bold recipient line when it adds information — the
        // salutation below already says "To Whom It May Concern," (Levi's
        // screenshot showed it doubled).
        if (
          draft?.typeId !== "owner_inspection_request" &&
          draft?.typeId !== "good_standing_request" &&
          recipient !== "To Whom It May Concern"
        ) {
          pg.text(M, y, recipient, { size: 10.8, font: "F4", color: BLACK });
          y += 14;
        }
        if (a.recipientOffice) {
          const { lines, spaceW } = layoutParagraph(a.recipientOffice, maxBodyW, 9.5);
          for (const ln of lines) {
            drawBodyLine(pg, M, y, ln, spaceW, maxBodyW, 9.5, false);
            y += 12.5;
          }
        }
        y += 8;
        if (draft?.reLine && draft?.typeId !== "owner_inspection_request") {
          pg.text(M, y, "RE: " + draft.reLine, { size: 10.8, font: "F4", color: BLACK });
          y += 16;
        }
        if (site && draft?.typeId !== "good_standing_request") {
          pg.text(M, y, "Site: " + site, { size: 9.5, color: GRAY });
          y += 15;
        }
        if (draft?.typeId !== "owner_inspection_request" && draft?.typeId !== "good_standing_request") {
          const dear =
            recipient === "To Whom It May Concern"
              ? "To Whom It May Concern,"
              : "Dear " + (String(recipient).split(",")[0] || "Sir/Madam") + ",";
          pg.text(M, y, dear, { size: 10.8, font: "F3", color: BLACK });
          y += 20;
        }
      }
    } else {
      pg.text(M, y, (draft?.reLine || draft?.typeLabel || "Letter") + " (continued)", {
        size: 9.5,
        color: GRAY,
      });
      y += 20;
    }

    // Body
    while ((lineQueue.length || paraIdx < paragraphs.length) && y < bodyBottom - bodyLead) {
      if (!lineQueue.length) lineQueue = nextParagraphLines();
      while (lineQueue.length && y < bodyBottom - bodyLead) {
        const ln = lineQueue.shift();
        drawBodyLine(pg, M, y, ln, ln.spaceW, maxBodyW, bodySize, ln.justify);
        y += bodyLead;
        if (ln.paraEnd) y += bodyLead * 0.42;
      }
    }

    const isLast = !lineQueue.length && paraIdx >= paragraphs.length;
    if (isLast) {
      // Signature block: Sincerely + image + name + credentials (+ DRAFT).
      const sigNeeds = 16 + (sigImage ? 46 : 34) + 16 + 13 + (draft?.status === "draft" ? 22 : 0);
      if (y + sigNeeds > bodyBottom + 14) {
        pages.push(pg);
        const pg2 = Page();
        if (!personal) {
          const afterBar = drawCompanyHeader(pg2, company, profile, logo);
          drawFooter(pg2, company, profile);
          y = afterBar + 34;
        } else {
          y = 72;
        }
        drawSignatureBlock(pg2, y, {
          sigImage,
          personal,
          resolvedSignerName,
          resolvedTitle,
          company,
          draft,
        });
        pageNo += 1;
        pg2.text(PAGE_W - M, 744, String(pageNo), { size: 8.5, color: LIGHTGRAY, align: "right" });
        pages.push(pg2);
        break;
      }
      y += 6;
      drawSignatureBlock(pg, y, {
        sigImage,
        personal,
        resolvedSignerName,
        resolvedTitle,
        company,
        draft,
      });
    }

    if (pageNo > 1 || !isLast) {
      pg.text(PAGE_W - M, 744, String(pageNo), { size: 8.5, color: LIGHTGRAY, align: "right" });
    }

    pages.push(pg);
    if (isLast) break;
    if (pages.length > 20) break;
  }

  // Photo pages — appended after the signed letter so the whole packet is one
  // PDF (and rides with the invoice email). Each photo keeps its native
  // proportions; the letter body already points the reader at them.
  const photos = Array.isArray(photoImages) ? photoImages.filter((p) => p && p.bytes && p.bytes.length) : [];
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const pg = Page();
    let y;
    if (personal) {
      y = 64;
    } else {
      const afterBar = drawCompanyHeader(pg, company, profile, logo);
      drawFooter(pg, company, profile);
      y = afterBar + 26;
    }
    pg.text(PAGE_W / 2, y, "ATTACHED PHOTOS", {
      size: 7.6,
      font: "F1",
      color: GREEN,
      tracking: 2,
      align: "center",
    });
    y += 10;
    if (photos.length > 1) {
      pg.text(PAGE_W / 2, y + 8, `Photo ${i + 1} of ${photos.length}`, {
        size: 8.5,
        font: "F3",
        color: LIGHTGRAY,
        align: "center",
      });
      y += 12;
    }
    y += 14;

    const capLines = photo.caption
      ? layoutParagraph(photo.caption, maxBodyW - 40, 9.5).lines
      : [];
    const capBlock = capLines.length ? capLines.length * 13 + 14 : 0;
    const boxTop = y;
    const boxH = Math.max(120, 726 - boxTop - capBlock);
    const fit = containSize(photo.width, photo.height, maxBodyW, boxH);
    const px = M + (maxBodyW - fit.width) / 2;
    pg.image(photo.name, px, boxTop, fit.width, fit.height);

    if (capLines.length) {
      let cy = boxTop + fit.height + 16;
      for (const ln of capLines) {
        // Captions are centered under the photo, never justified.
        let cx = PAGE_W / 2 - ln.width / 2;
        for (const w of ln.words) {
          pg.text(cx, cy, w.t, { size: 9.5, font: w.bold ? "F4" : "F3", color: GRAY });
          cx += w.w + (250 / 1000) * 9.5;
        }
        cy += 13;
      }
    }
    pages.push(pg);
  }

  const images = [];
  if (logo && logo.bytes) images.push(logo);
  if (sigImage && sigImage.bytes) images.push(sigImage);
  for (const p of photos) images.push(p);
  return assemblePdf(pages, images);
}

function drawSignatureBlock(pg, startY, { sigImage, personal, resolvedSignerName, resolvedTitle, company, draft }) {
  let y = startY;
  pg.text(M, y, "Sincerely,", { size: 10.6, font: "F3", color: BLACK });
  y += 10;
  if (sigImage) {
    const w = 150;
    const h = (sigImage.height / sigImage.width) * w;
    pg.image(sigImage.name, M, y - 2, w, h);
    y += h + 12;
  } else {
    y += 30;
  }
  if (resolvedSignerName) {
    pg.text(M, y, resolvedSignerName, { size: 11.5, font: "F4", color: BLACK });
    y += 13;
  }
  if (!personal) {
    const cred = [
      resolvedTitle,
      company.name,
      company.license ? "Lic #" + licenseNo(company.license) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (cred) {
      pg.text(M, y, cred, { size: 8, font: "F1", color: GRAY });
      y += 13;
    }
  } else if (resolvedTitle) {
    pg.text(M, y, resolvedTitle, { size: 9, color: GRAY });
    y += 13;
  }
  if (draft?.status === "draft") {
    y += 10;
    pg.text(M, y, "DRAFT — pending approval", { size: 10, font: "F2", color: [0.7, 0.15, 0.1] });
  }
}

/** @returns {Blob} */
export function buildLetterheadPdfBlob(opts) {
  const bytes = buildLetterheadPdf(opts);
  return new Blob([bytes], { type: "application/pdf" });
}

/**
 * Letter PDF including its attached photo pages.
 *
 * Photos must be fetched + transcoded before they can be embedded, so this is
 * the async entry point. Callers that only need the text pages (or already
 * hold decoded images) can keep using buildLetterheadPdf directly.
 *
 * @returns {Promise<Uint8Array>}
 */
export async function buildLetterheadPdfWithPhotos(opts = {}) {
  let photoImages = opts.photoImages;
  if (!photoImages) {
    try {
      photoImages = await loadLetterPhotoImages(opts?.draft?.photos || []);
    } catch {
      photoImages = []; // a photo problem must never cost us the letter
    }
  }
  return buildLetterheadPdf({ ...opts, photoImages });
}

/** @returns {Promise<Blob>} */
export async function buildLetterheadPdfBlobWithPhotos(opts) {
  const bytes = await buildLetterheadPdfWithPhotos(opts);
  return new Blob([bytes], { type: "application/pdf" });
}

/** Filename for a letter draft. */
export function letterPdfFileName(draft) {
  const type = String(draft?.typeLabel || "Letter").replace(/[^\w]+/g, "_");
  const site = String(draft?.siteAddress || "")
    .replace(/[^\w]+/g, "_")
    .slice(0, 40);
  return [type, site].filter(Boolean).join("_") + ".pdf";
}
