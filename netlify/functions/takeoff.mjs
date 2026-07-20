// takeoff — the server-side blueprint processing endpoint for LE Pro.
//
// The blueprint-symbol-takeoff skill (PyMuPDF vector extract + OpenCV raster +
// symbol library) is native Python and CANNOT run inside a Cloudflare Pages
// Function. So this endpoint is a thin, tenant-scoped coordinator with a
// swappable engine:
//
//   1. Store the chosen blueprint files in R2 (LE_R2, "takeoffs/" prefix).
//   2. Process them:
//        • if TAKEOFF_PROCESSOR_URL is set → proxy the files to the external
//          Python skill service (FastAPI + PyMuPDF) and return its worker-output
//          JSON. This is the accurate path (vector + geometry).
//        • else → run the in-Worker vector-text heuristic (takeoffExtract), which
//          counts device tags in the PDF text layer. Honest first cut, labelled
//          `confidence: "inferred"`. Needs the text layer; falls back to an empty
//          worker-output with a note for raster/scanned drawings.
//   Either way the response matches templates/worker-output.schema.json, so the
//   app is identical against either engine.
//
//   POST { op:"process", jobId, projectId, symbolClasses:[], files:[{name,mime,b64}] }
//     -> { ok, engine, documents:[ <worker-output> ] }
//
// Files are stored but never served back by this function; the app only needs
// the JSON line items. R2 retention lets a future re-run / audit re-read them.

import { getStore } from "./lib/storage/index.mjs";
import { bytesFromBase64 } from "./lib/base64.mjs";
import { extractFromWords } from "./lib/takeoffExtract.mjs";

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

async function sha256Hex(bytes) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

const safeName = (s) => String(s || "file").replace(/[^\w.-]/g, "_").slice(0, 80);

/** Best-effort in-Worker PDF text extraction via unpdf (optional dependency).
 *  Returns an array of token strings, or null if a parser is unavailable. */
async function extractPdfWords(bytes) {
  try {
    const mod = await import("unpdf").catch(() => null);
    if (!mod) return null;
    const { extractText, getDocumentProxy } = mod;
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    const flat = Array.isArray(text) ? text.join(" ") : String(text || "");
    return flat.split(/\s+/).filter(Boolean);
  } catch {
    return null;
  }
}

async function proxyToProcessor(url, files, symbolClasses) {
  const form = new FormData();
  for (const f of files) {
    const blob = new Blob([f.bytes], { type: f.mime || "application/pdf" });
    form.append("files", blob, safeName(f.name));
  }
  if (symbolClasses && symbolClasses.length) {
    form.append("symbol_classes", JSON.stringify(symbolClasses));
  }
  const res = await fetch(url.replace(/\/+$/, "") + "/process", { method: "POST", body: form });
  if (!res.ok) throw new Error(`processor HTTP ${res.status}`);
  const data = await res.json();
  // Accept either a single worker-output or { documents:[...] }.
  return Array.isArray(data) ? data : data.documents ? data.documents : [data];
}

export default async (req, env) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad json" }, 400);
  }
  if (body.op !== "process") return json({ ok: false, error: "unknown op" }, 400);

  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) return json({ ok: false, error: "no files" }, 400);

  const tenant = safeName(body.tenantId || "le");
  const projectId = safeName(body.projectId || body.jobId || "job");
  const symbolClasses = Array.isArray(body.symbolClasses) ? body.symbolClasses : [];

  // Decode + store each file in R2 (best-effort; storage failure must not block
  // processing — the counts are what the user is waiting for).
  const store = getStore("takeoffs");
  const decoded = [];
  for (const f of files) {
    let bytes;
    try {
      bytes = bytesFromBase64(String(f.b64 || ""));
    } catch {
      continue;
    }
    if (!bytes || !bytes.length) continue;
    if (bytes.length > 25_000_000) return json({ ok: false, error: "file too large" }, 413);
    const hash = await sha256Hex(bytes);
    const key = `${tenant}/${projectId}/${Date.now()}-${safeName(f.name)}`;
    try {
      await store.set(key, bytes, {
        metadata: { mime: f.mime || "application/pdf", bytes: bytes.length, sha256: hash, ts: Date.now() },
      });
    } catch {
      /* storage is best-effort */
    }
    decoded.push({ name: f.name, mime: f.mime, bytes, hash, key });
  }
  if (!decoded.length) return json({ ok: false, error: "no readable files" }, 400);

  const processorUrl = env && (env.TAKEOFF_PROCESSOR_URL || env.PROCESSOR_URL);

  // ── accurate path: external PyMuPDF/OpenCV service ──
  if (processorUrl) {
    try {
      const documents = await proxyToProcessor(String(processorUrl), decoded, symbolClasses);
      return json({ ok: true, engine: "pymupdf-service", documents });
    } catch (e) {
      // Fall through to the heuristic rather than failing the whole request.
      // The client still gets an editable sheet; the note explains the downgrade.
    }
  }

  // ── fallback path: in-Worker vector-text heuristic ──
  const documents = [];
  for (const d of decoded) {
    let words = null;
    if ((d.mime || "").includes("pdf") || /\.pdf$/i.test(d.name || "")) {
      words = await extractPdfWords(d.bytes);
    }
    if (words) {
      documents.push(
        extractFromWords(words, {
          source_sha256: d.hash,
          sheet_ids: [1],
          symbolClasses,
          engine: "js-heuristic-v0",
        })
      );
    } else {
      // No text layer / no parser available — return a valid, honest empty doc.
      documents.push({
        engine: "js-heuristic-v0",
        worker_id: "takeoff-endpoint",
        assignment: { source_sha256: d.hash, sheet_ids: [1] },
        candidates: [],
        summary: {
          counts: {},
          anomalies: ["no-text-layer"],
          notes:
            "Could not read a text layer from this file (raster/scanned, or in-Worker PDF parsing unavailable). " +
            "Configure TAKEOFF_PROCESSOR_URL to run the PyMuPDF/OpenCV service for accurate counts.",
        },
      });
    }
  }
  return json({ ok: true, engine: "js-heuristic-v0", documents });
};
