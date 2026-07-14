// Build a simple printable PDF from description / scope text (no external deps).

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 54;
const TOP_Y = 740;
const BOTTOM_Y = 54;
const BODY_SIZE = 11;
const TITLE_SIZE = 16;
const SUB_SIZE = 11;
const LINE_LEAD = 14;

function esc(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
}

function wrapParagraph(para, max = 88) {
  const words = String(para || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const out = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

function bodyLines(text) {
  const lines = [];
  for (const para of String(text || "").split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    lines.push(...wrapParagraph(para));
  }
  return lines.length ? lines : [""];
}

function textLine(y, text, size) {
  return `BT /F1 ${size} Tf 1 0 0 1 ${MARGIN_X} ${y} Tm (${esc(text)}) Tj ET`;
}

function buildPages(title, subtitle, body, footer) {
  const content = bodyLines(body);
  const pages = [];
  let idx = 0;

  while (idx < content.length || !pages.length) {
    const cmds = [];
    let y = TOP_Y;

    if (!pages.length) {
      if (title) {
        cmds.push(textLine(y, title, TITLE_SIZE));
        y -= 22;
      }
      if (subtitle) {
        cmds.push(textLine(y, subtitle, SUB_SIZE));
        y -= 18;
      }
      cmds.push(textLine(y, "Scope / description", SUB_SIZE));
      y -= 20;
      if (footer) cmds.push(textLine(36, footer, 9));
    }

    const bodyCmds = [];
    let consumed = 0;
    for (let i = idx; i < content.length; i++) {
      if (y < BOTTOM_Y) break;
      bodyCmds.push(`1 0 0 1 ${MARGIN_X} ${y} Tm (${esc(content[i])}) Tj`);
      y -= LINE_LEAD;
      consumed++;
    }

    if (bodyCmds.length) {
      cmds.push(`BT /F1 ${BODY_SIZE} Tf`);
      cmds.push(bodyCmds.join("\n"));
      cmds.push("ET");
    } else if (!pages.length) {
      cmds.push(textLine(TOP_Y - 40, "No description yet.", BODY_SIZE));
      consumed = content.length;
    }

    pages.push(cmds.join("\n"));
    if (!consumed) break;
    idx += consumed;
  }

  return pages;
}

/** @returns {Blob} application/pdf */
export function buildDescriptionPdf({ title = "BLZ Electric", subtitle = "", body = "", footer = "" } = {}) {
  const pageBodies = buildPages(title, subtitle, body, footer);
  const objs = [];
  const kids = [];

  objs.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  kids.push(...pageBodies.map((_, i) => `${3 + i * 2} 0 R`));
  objs.push(`2 0 obj << /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageBodies.length} >> endobj\n`);

  const fontId = 3 + pageBodies.length * 2;
  pageBodies.forEach((stream, i) => {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    const bytes = stream.length;
    objs.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >> endobj\n`
    );
    objs.push(`${contentId} 0 obj << /Length ${bytes} >> stream\n${stream}\nendstream\nendobj\n`);
  });

  objs.push(`${fontId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n`);

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
  let xrefTable = "xref\n0 " + (fontId + 1) + "\n0000000000 65535 f \n";
  for (let i = 1; i <= fontId; i++) {
    const off = xref[i] || 0;
    xrefTable += String(off).padStart(10, "0") + " 00000 n \n";
  }
  pdf += xrefTable;
  pdf += `trailer << /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}