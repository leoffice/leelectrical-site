/**
 * Client-side PDF for agency applications.
 * Con Ed Form A → fill the real AcroForm (application-for-service.pdf) page 1.
 * Other agencies / fallback → lightweight field-dump PDF (no form template).
 */
import { applicationFieldRows } from "./engine.js";
import { fillConedFormAPdfBytes } from "./fillConedFormA.js";
import { buildConedCompletedFileName } from "./completedFileName.js";

const PAGE_W = 612;
const PAGE_H = 792;
const M = 48;
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
  const words = String(str || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const trial = cur + " " + words[i];
    if (textWidth(trial, size, bold) <= maxW) cur = trial;
    else {
      lines.push(cur);
      cur = words[i];
    }
  }
  lines.push(cur);
  return lines;
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
    rule(x1, x2, topY) {
      const y = PAGE_H - topY;
      ops.push(`${RULE[0]} ${RULE[1]} ${RULE[2]} RG 0.6 w ${r2(x1)} ${r2(y)} m ${r2(x2)} ${r2(y)} l S`);
    },
    stream: () => ops.join("\n"),
  };
}

function assemblePdf(pages) {
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
  const fontReg = 3 + n * 2;
  const fontBold = fontReg + 1;
  const pageKids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  obj(1, "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  obj(2, `2 0 obj << /Type /Pages /Kids [${pageKids}] /Count ${n} >> endobj\n`);
  for (let i = 0; i < n; i++) {
    const pageObj = 3 + i * 2;
    const contentObj = 4 + i * 2;
    const stream = pages[i].stream();
    obj(
      pageObj,
      `${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> >> >> endobj\n`
    );
    obj(contentObj, `${contentObj} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`);
  }
  obj(fontReg, `${fontReg} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n`);
  obj(fontBold, `${fontBold} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n`);
  const maxId = fontBold;
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

/**
 * @param {object} opts
 * @param {import('./engine.js').AgencyConfig} opts.agency
 * @param {Record<string, any>} opts.answers
 * @param {object} [opts.job]
 * @returns {Uint8Array}
 */
export function buildApplicationPdfBytes({ agency, answers, job = {} } = {}) {
  const rows = applicationFieldRows(agency, answers);
  const title = agency?.formTitle || agency?.label || "Application";
  const site = job.serviceAddress || job.address || "";
  const cust = job.customer || job.customerName || "";

  const contentLines = [];
  contentLines.push({ kind: "title", text: title });
  if (cust || site) contentLines.push({ kind: "meta", text: [cust, site].filter(Boolean).join(" · ") });
  contentLines.push({ kind: "meta", text: "Completed application — all filled fields" });
  contentLines.push({ kind: "rule" });

  let lastStep = "";
  for (const r of rows) {
    if (r.stepTitle !== lastStep) {
      lastStep = r.stepTitle;
      contentLines.push({ kind: "section", text: lastStep });
    }
    contentLines.push({ kind: "field", label: r.label, value: r.value });
  }
  if (!rows.length) contentLines.push({ kind: "meta", text: "(No fields filled yet)" });

  const pages = [];
  let idx = 0;
  const maxW = PAGE_W - M * 2;
  const labelW = 170;

  while (idx < contentLines.length || pages.length === 0) {
    const pg = Page();
    let y = 52;
    if (pages.length > 0) {
      pg.text(M, y, title + " (continued)", { size: 10, bold: true, color: GREEN });
      y += 18;
      pg.rule(M, PAGE_W - M, y);
      y += 14;
    }

    while (idx < contentLines.length) {
      const item = contentLines[idx];
      let need = 16;
      if (item.kind === "title") need = 22;
      if (item.kind === "section") need = 22;
      if (item.kind === "field") {
        const valLines = wrap(item.value, maxW - labelW - 8, 10, false);
        need = Math.max(14, valLines.length * 12) + 4;
      }
      if (y + need > PAGE_H - 48 && pages.length >= 0 && y > 80) break;

      if (item.kind === "title") {
        pg.text(M, y, item.text, { size: 14, bold: true, color: GREEN });
        y += 18;
      } else if (item.kind === "meta") {
        for (const ln of wrap(item.text, maxW, 9)) {
          pg.text(M, y, ln, { size: 9, color: GRAY });
          y += 12;
        }
      } else if (item.kind === "rule") {
        pg.rule(M, PAGE_W - M, y);
        y += 14;
      } else if (item.kind === "section") {
        y += 6;
        pg.text(M, y, item.text, { size: 11, bold: true, color: BLACK });
        y += 16;
      } else if (item.kind === "field") {
        pg.text(M, y, item.label, { size: 9, color: GRAY });
        const valLines = wrap(item.value, maxW - labelW - 8, 10, false);
        let vy = y;
        for (const ln of valLines) {
          pg.text(M + labelW, vy, ln, { size: 10, bold: true });
          vy += 12;
        }
        y = Math.max(y + 14, vy + 2);
      }
      idx += 1;
    }
    pages.push(pg);
    if (idx >= contentLines.length) break;
  }

  return assemblePdf(pages);
}

export function applicationPdfFileName(agency, job = {}, answers = {}) {
  // Con Ed completed apps use the productization §3 searchable name.
  if (agency?.id === "coned-form-a" || agency?.sourceForm) {
    return buildConedCompletedFileName({ answers, job });
  }
  const id = agency?.id || "application";
  const site = String(job.serviceAddress || job.address || "job")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${id}-${site || "job"}.pdf`;
}

/**
 * Prefer filled official Form A for Con Ed; otherwise field-dump PDF.
 * @param {object} opts
 * @returns {Promise<Blob>}
 */
export async function buildApplicationPdfBlob(opts = {}) {
  const agency = opts.agency;
  if (agency?.id === "coned-form-a" || agency?.sourceForm) {
    try {
      const filled = await fillConedFormAPdfBytes({ answers: opts.answers || {} });
      return new Blob([filled], { type: "application/pdf" });
    } catch (err) {
      // Fall through to field dump so preview/submit never hard-fails offline
      console.warn("[agencyForms] Form A fill failed, using field dump", err);
    }
  }
  const bytes = buildApplicationPdfBytes(opts);
  return new Blob([bytes], { type: "application/pdf" });
}

/**
 * Async bytes helper — filled Form A when available.
 * @param {object} opts
 * @returns {Promise<Uint8Array>}
 */
export async function buildApplicationPdfBytesAsync(opts = {}) {
  const agency = opts.agency;
  if (agency?.id === "coned-form-a" || agency?.sourceForm) {
    try {
      return await fillConedFormAPdfBytes({ answers: opts.answers || {} });
    } catch {
      /* fallback */
    }
  }
  return buildApplicationPdfBytes(opts);
}

export async function blobToBase64(blob) {
  // Node / vitest (no FileReader): use arrayBuffer + Buffer when available.
  if (typeof FileReader === "undefined") {
    const ab = await blob.arrayBuffer();
    if (typeof Buffer !== "undefined") {
      return Buffer.from(ab).toString("base64");
    }
    const bytes = new Uint8Array(ab);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}
