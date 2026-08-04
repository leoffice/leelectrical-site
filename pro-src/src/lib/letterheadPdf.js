// Professional letterhead PDF — company header + body + signature block.
// Same client-side byte-writer style as descriptionPdf / qbInvoicePdf (no deps).
import { resolvePdfLogoImageSync } from "./companyLogoPdf.js";
import { tenantCompany, activeTenantConfig } from "./tenantBranding.js";
import { wrapPrintDescription } from "./printDescription.js";
import { applySignature, resolveSigner } from "./signatureService.js";

const PAGE_W = 612;
const PAGE_H = 792;
const M = 54;
const GREEN = [6 / 255, 106 / 255, 52 / 255];
const GRAY = [100 / 255, 104 / 255, 110 / 255];
const BLACK = [0, 0, 0];
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
    w += t[c - 32] || 500;
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

function latin1(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function wrap(str, maxW, size, bold = false) {
  return wrapPrintDescription(str, maxW, (s) => textWidth(s, size, bold));
}

function Page() {
  const ops = [];
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
    rule(x1, x2, topY) {
      const y = PAGE_H - topY;
      ops.push(`${RULE[0]} ${RULE[1]} ${RULE[2]} RG 0.6 w ${r2(x1)} ${r2(y)} m ${r2(x2)} ${r2(y)} l S`);
    },
    image(name, x, topY, w, h) {
      ops.push(`q ${r2(w)} 0 0 ${r2(h)} ${r2(x)} ${r2(PAGE_H - topY - h)} cm /${name} Do Q`);
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
  const hasImage = !!(image && image.bytes && image.bytes.length && image.name);
  const fontReg = 3 + n * 2;
  const fontBold = fontReg + 1;
  const imgId = hasImage ? fontBold + 1 : null;

  const pageKids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  obj(1, "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  obj(2, `2 0 obj << /Type /Pages /Kids [${pageKids}] /Count ${n} >> endobj\n`);

  for (let i = 0; i < n; i++) {
    const pageObj = 3 + i * 2;
    const contentObj = 4 + i * 2;
    const stream = pages[i].stream();
    const xobjs = hasImage ? ` /XObject << /${image.name} ${imgId} 0 R >>` : "";
    obj(
      pageObj,
      `${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >>${xobjs} >> >> endobj\n`
    );
    obj(contentObj, `${contentObj} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`);
  }

  obj(fontReg, `${fontReg} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n`);
  obj(fontBold, `${fontBold} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n`);

  if (hasImage) {
    const bytes = image.bytes;
    obj(
      imgId,
      `${imgId} 0 obj << /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >> stream\n`
    );
    push(bytes);
    push("\nendstream\nendobj\n");
  }

  const maxId = hasImage ? imgId : fontBold;
  const xrefStart = offset;
  push(`xref\n0 ${maxId + 1}\n`);
  push("0000000000 65535 f \n");
  for (let i = 1; i <= maxId; i++) {
    push(String(xref[i] || 0).padStart(10, "0") + " 00000 n \n");
  }
  push(`trailer << /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function formatDate(d = new Date()) {
  try {
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Build letterhead PDF bytes from a letter draft + optional company override.
 * @param {object} opts
 * @param {object} opts.draft — LetterDraft
 * @param {object} [opts.company] — override tenantCompany()
 * @param {string} [opts.signerName]
 * @param {string} [opts.signerTitle]
 * @returns {Uint8Array}
 */
export function buildLetterheadPdf({ draft, company: companyOverride, signerName, signerTitle, profile: profileOverride } = {}) {
  const company = companyOverride || tenantCompany();
  const profile = profileOverride || activeTenantConfig()?.profile || null;
  const personal = (draft?.letterhead || "") === "personal";
  const logo = personal ? null : resolvePdfLogoImageSync();
  const signer = resolveSigner(profile, draft?.ownerId);
  const sigApply = applySignature({ profile, ownerId: draft?.ownerId || signer?.id });
  // Levi 2026-08-04: default company-only sign-off (short name, no President).
  // Personal letterheads and explicit "signer" mode keep a person + title.
  const letterSigMode = personal
    ? "signer"
    : String(profile?.letterSignatureMode || "company").toLowerCase() === "signer"
      ? "signer"
      : "company";
  const companySignName =
    String(profile?.shortName || "").trim() || company.name || "";
  const resolvedSignerName =
    letterSigMode === "company" && !personal
      ? companySignName
      : signerName ||
        (personal ? draft?.answers?.ownerName || signer?.fullName : signer?.fullName) ||
        company.name ||
        "";
  const resolvedTitle =
    letterSigMode === "company" && !personal
      ? ""
      : signerTitle || (personal ? "" : signer?.title || "President");
  const maxBodyW = PAGE_W - M * 2;
  const bodySize = 11;
  const bodyLead = 15;

  const bodyParas = String(draft?.bodyText || "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);

  // Pre-wrap all body lines for pagination
  const allBodyLines = [];
  for (const para of bodyParas) {
    // preserve single newlines as soft breaks for address blocks
    const sub = String(para).split("\n");
    const wrapped = [];
    for (const piece of sub) {
      wrapped.push(...wrap(piece, maxBodyW, bodySize, false));
    }
    if (allBodyLines.length) allBodyLines.push(""); // blank between paras
    allBodyLines.push(...wrapped);
  }
  if (!allBodyLines.length) allBodyLines.push("[No letter body yet]");

  const pages = [];
  let lineIdx = 0;
  let pageNo = 0;

  while (lineIdx < allBodyLines.length || pages.length === 0) {
    pageNo += 1;
    const pg = Page();
    let y = 48;

    // Header — company letterhead OR personal (Type 4)
    if (!personal && logo && logo.name) {
      const logoH = 42;
      const logoW = Math.min(120, (logo.width / logo.height) * logoH);
      pg.image(logo.name, (PAGE_W - logoW) / 2, y, logoW, logoH);
      y += logoH + 10;
    }

    if (personal) {
      const oname = draft?.answers?.ownerName || signer?.fullName || resolvedSignerName || "";
      const oemail = draft?.answers?.ownerEmail || signer?.personalEmail || "";
      const ophone = draft?.answers?.ownerPhone || signer?.personalPhone || "";
      if (oname) {
        pg.text(M, y, oname, { size: 13, bold: true, color: BLACK });
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
    } else {
      pg.text(M, y, company.name || "Company", { size: 13, bold: true, color: GREEN });
      y += 16;
      if (company.street) {
        pg.text(M, y, company.street, { size: 9, color: GRAY });
        y += 12;
      }
      if (company.cityStateZip) {
        pg.text(M, y, company.cityStateZip, { size: 9, color: GRAY });
        y += 12;
      }
      const contact = [company.phone, company.email, company.license ? "Lic. " + company.license : ""]
        .filter(Boolean)
        .join("  ·  ");
      if (contact) {
        pg.text(M, y, contact, { size: 9, color: GRAY });
        y += 12;
      }
    }
    pg.rule(M, PAGE_W - M, y + 4);
    y += 22;

    // Date + recipient (page 1 only)
    if (pageNo === 1) {
      pg.text(M, y, formatDate(), { size: 11 });
      y += 20;
      // Title line for affidavits / load letters
      if (draft?.typeLabel && draft.typeId !== "general" && draft.typeId !== "owner_inspection_request") {
        pg.text(M, y, String(draft.typeLabel).toUpperCase(), { size: 12, bold: true, color: GREEN });
        y += 18;
      }
      const recipient =
        draft?.answers?.recipient ||
        (draft?.typeId === "good_standing_request"
          ? "New York State Department of State"
          : draft?.typeId === "owner_inspection_request"
            ? "NYC Department of Buildings"
            : "To Whom It May Concern");
      if (draft?.typeId !== "owner_inspection_request" && draft?.typeId !== "good_standing_request") {
        pg.text(M, y, recipient, { size: 11, bold: true });
        y += 14;
      }
      if (draft?.answers?.recipientOffice) {
        for (const ln of wrap(draft.answers.recipientOffice, maxBodyW, 10)) {
          pg.text(M, y, ln, { size: 10, color: GRAY });
          y += 13;
        }
      }
      y += 8;
      if (draft?.reLine && draft?.typeId !== "owner_inspection_request") {
        pg.text(M, y, "RE: " + draft.reLine, { size: 11, bold: true });
        y += 18;
      }
      if (draft?.siteAddress && draft?.typeId !== "good_standing_request") {
        pg.text(M, y, "Site: " + draft.siteAddress, { size: 10, color: GRAY });
        y += 16;
      }
      if (draft?.typeId !== "owner_inspection_request" && draft?.typeId !== "good_standing_request") {
        const dear =
          recipient === "To Whom It May Concern"
            ? "To Whom It May Concern,"
            : "Dear " + (String(recipient).split(",")[0] || "Sir/Madam") + ",";
        pg.text(M, y, dear, { size: 11 });
        y += 20;
      }
    } else {
      pg.text(M, y, (draft?.reLine || draft?.typeLabel || "Letter") + " (continued)", {
        size: 10,
        color: GRAY,
      });
      y += 18;
    }

    const footerReserve = pageNo === pages.length + 1 ? 140 : 60;
    // Write body until near bottom; leave room for signature on last page.
    // We don't know last page yet — use two-pass: first fill, then if leftover none, signature.

    while (lineIdx < allBodyLines.length && y < PAGE_H - 100) {
      const line = allBodyLines[lineIdx];
      if (line === "") {
        y += bodyLead * 0.6;
      } else {
        pg.text(M, y, line, { size: bodySize });
        y += bodyLead;
      }
      lineIdx += 1;
      // If remaining lines are few, keep going; if near bottom and more content, break for next page
      if (y > PAGE_H - 120 && lineIdx < allBodyLines.length) break;
    }

    const isLast = lineIdx >= allBodyLines.length;
    if (isLast) {
      // Ensure signature block fits
      if (y > PAGE_H - 130) {
        // push signature to next page by leaving a marker — if no room, new page
        pages.push(pg);
        const pg2 = Page();
        let y2 = 72;
        pg2.text(M, y2, "Sincerely,", { size: 11 });
        y2 += 48;
        // Signature image reserved: applySignature dataUrl applied when multi-image PDF lands;
        // Phase 1 places typed signer name (registered image id stored on draft.ownerId).
        if (sigApply?.dataUrl) {
          y2 += 4; // spacing for future image
        }
        if (resolvedSignerName) {
          pg2.text(
            M,
            y2,
            resolvedSignerName + (resolvedTitle ? ", " + resolvedTitle : ""),
            { size: 11, bold: true }
          );
        }
        y2 += 14;
        if (resolvedTitle && resolvedSignerName && !resolvedSignerName.includes(resolvedTitle)) {
          pg2.text(M, y2, resolvedTitle, { size: 10, color: GRAY });
          y2 += 14;
        }
        if (company.license) pg2.text(M, y2, "License: " + company.license, { size: 9, color: GRAY });
        if (draft?.status === "draft") {
          y2 += 24;
          pg2.text(M, y2, "DRAFT — pending approval", { size: 10, bold: true, color: [0.7, 0.15, 0.1] });
        }
        pages.push(pg2);
        break;
      }
      y += 18;
      pg.text(M, y, "Sincerely,", { size: 11 });
      y += 40;
      if (sigApply?.dataUrl && letterSigMode === "signer") {
        // Anchor reserved — typed name below is always present for legal clarity
        y += 8;
      }
      if (resolvedSignerName) {
        pg.text(
          M,
          y,
          resolvedSignerName + (resolvedTitle && !personal ? ", " + resolvedTitle : ""),
          { size: 11, bold: true }
        );
      }
      y += 14;
      if (!personal && company.license) pg.text(M, y, "License: " + company.license, { size: 9, color: GRAY });
      if (draft?.status === "draft") {
        y += 22;
        pg.text(M, y, "DRAFT — pending approval", { size: 10, bold: true, color: [0.7, 0.15, 0.1] });
      }
    }

    // footer page number
    if (pageNo > 1 || !isLast) {
      pg.text(PAGE_W / 2, PAGE_H - 28, String(pageNo), { size: 9, color: GRAY, align: "left" });
    }

    pages.push(pg);
    if (isLast) break;
    // safety
    if (pages.length > 20) break;
  }

  return assemblePdf(pages, logo);
}

/** @returns {Blob} */
export function buildLetterheadPdfBlob(opts) {
  const bytes = buildLetterheadPdf(opts);
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
