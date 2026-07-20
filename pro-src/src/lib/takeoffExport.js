// Takeoff exporters — CSV (light) + a real .xlsx (editable working copy),
// both dependency-free. The .xlsx is assembled as a minimal OOXML package in a
// STORED (uncompressed) zip with correct CRC-32s, which Excel / Numbers / Sheets
// all open. The branded PDF lives in takeoffPdf.js (it reuses the doc engine).

import { lineValue, totalQty, totalValue } from "./takeoffModel.js";

const COLUMNS = [
  { key: "symbol", label: "Symbol" },
  { key: "symbolClass", label: "Class" },
  { key: "description", label: "Description" },
  { key: "qty", label: "Qty", num: true },
  { key: "unit", label: "Unit" },
  { key: "unitPrice", label: "Unit Price", num: true },
  { key: "amount", label: "Amount", num: true, derived: (it) => lineValue(it) },
  { key: "method", label: "Method" },
  { key: "confidence", label: "Confidence" },
];

/** [header, ...rows] as a matrix of cell values (numbers stay numbers). */
export function takeoffToMatrix(items) {
  const header = COLUMNS.map((c) => c.label);
  const rows = (items || []).map((it) =>
    COLUMNS.map((c) => {
      if (c.derived) return round2(c.derived(it));
      const v = it[c.key];
      if (c.num) return Number(v) || 0;
      return v == null ? "" : String(v);
    })
  );
  // Totals row.
  rows.push(["", "", "TOTAL", totalQty(items), "", "", round2(totalValue(items)), "", ""]);
  return [header, ...rows];
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/* ───────────────────────────────── CSV ─────────────────────────────────── */

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildTakeoffCsv(items, meta = {}) {
  const lines = [];
  if (meta.title) lines.push(csvCell(meta.title));
  if (meta.subtitle) lines.push(csvCell(meta.subtitle));
  if (meta.title || meta.subtitle) lines.push("");
  for (const row of takeoffToMatrix(items)) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n");
}

/* ──────────────────────────────── XLSX ─────────────────────────────────── */

const xmlEsc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function colName(n) {
  // 0 -> A, 25 -> Z, 26 -> AA
  let s = "";
  n = n + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(matrix) {
  const rowsXml = matrix
    .map((row, r) => {
      const cells = row
        .map((val, c) => {
          const ref = `${colName(c)}${r + 1}`;
          if (typeof val === "number" && isFinite(val)) {
            return `<c r="${ref}"><v>${val}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rowsXml}</sheetData></worksheet>`
  );
}

const WORKBOOK_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  `<sheets><sheet name="Takeoff" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `</Relationships>`;

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

/** Build a valid .xlsx Blob from the takeoff items. */
export function buildTakeoffXlsx(items, meta = {}) {
  const matrix = [];
  if (meta.title) matrix.push([meta.title]);
  if (meta.subtitle) matrix.push([meta.subtitle]);
  if (meta.title || meta.subtitle) matrix.push([]);
  for (const row of takeoffToMatrix(items)) matrix.push(row);

  const files = [
    { name: "[Content_Types].xml", data: CONTENT_TYPES },
    { name: "_rels/.rels", data: ROOT_RELS },
    { name: "xl/workbook.xml", data: WORKBOOK_XML },
    { name: "xl/_rels/workbook.xml.rels", data: WORKBOOK_RELS },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(matrix) },
  ];
  const zip = zipStore(files);
  return new Blob([zip], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ───────────────────────── minimal STORED zip writer ───────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = enc.encode(f.data);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const local = [
      ...u32(0x04034b50), // local file header signature
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // method 0 = stored
      ...u16(0), // mod time
      ...u16(0x21), // mod date (fixed, deterministic)
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0), // extra len
    ];
    chunks.push(new Uint8Array(local), nameBytes, dataBytes);

    central.push([
      ...u32(0x02014b50), // central dir header
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0x21),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      nameBytes,
    ]);

    offset += local.length + nameBytes.length + dataBytes.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  const centralChunks = [];
  for (const rec of central) {
    const nameBytes = rec[rec.length - 1];
    const head = rec.slice(0, rec.length - 1);
    const buf = new Uint8Array(head.length + nameBytes.length);
    buf.set(head, 0);
    buf.set(nameBytes, head.length);
    centralChunks.push(buf);
    centralSize += buf.length;
  }

  const end = new Uint8Array([
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(centralSize),
    ...u32(centralStart),
    ...u16(0),
  ]);

  const total =
    chunks.reduce((s, c) => s + c.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  for (const c of centralChunks) {
    out.set(c, p);
    p += c.length;
  }
  out.set(end, p);
  return out;
}
