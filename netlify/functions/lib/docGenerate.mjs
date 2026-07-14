import { getStore } from "./storage/index.mjs";
import { canGenerateLocalDoc, docPdfFilename, docStoreKey, mapJobToQbDocData } from "./jobToQbDoc.mjs";
import { LOGO_BYTES, FONT_REG_BYTES, FONT_BOLD_BYTES } from "./le-invoice-suite/assets-embedded.mjs";

const JOBS_KEY = "jobsdata-v1";
const STATE_KEY = "ov-v1";

// pdfkit is a Node library. On the Cloudflare Workers runtime it is loaded
// lazily and defensively: if it (or its deps) cannot run in this environment,
// generateAndStoreDoc degrades to { ok:false } and callers fall back to the
// QuickBooks fetch_pdf pipeline instead of crashing the function.
let _generateDocument = null;
let _pdfLoadTried = false;
let _pdfLoadError = "";
async function loadGenerator() {
  if (_pdfLoadTried) return _generateDocument;
  _pdfLoadTried = true;
  try {
    const mod = await import("./le-invoice-suite/qb-pdf.js");
    _generateDocument = mod.generateDocument || (mod.default && mod.default.generateDocument) || null;
    if (typeof _generateDocument !== "function") _pdfLoadError = "generateDocument export missing";
  } catch (err) {
    _pdfLoadError = String(err?.stack || err?.message || err).slice(0, 500);
    console.error("[docGenerate] pdfkit generator unavailable on this runtime:", _pdfLoadError);
    _generateDocument = null;
  }
  return _generateDocument;
}

export function pdfLoadError() {
  return _pdfLoadError;
}

/** Load a merged job (base + ov overlay) by invoice # or job id. */
export async function loadJobForInvoice(invoiceNo, jobId = "") {
  const jobsStore = getStore("jobsdata");
  const stateStore = getStore("jobstate");
  const jobsDoc =
    (await jobsStore.get(JOBS_KEY, { type: "json", consistency: "strong" })) || { jobs: [] };
  const inv = String(invoiceNo || "").trim();
  const hint = String(jobId || "").trim();
  let baseJob = {};
  if (hint) {
    baseJob = (jobsDoc.jobs || []).find((j) => String(j.id) === hint) || {};
  }
  if (!baseJob.id && inv) {
    baseJob = (jobsDoc.jobs || []).find((j) => String(j.invoiceNo || "").trim() === inv) || {};
  }
  if (!baseJob.id) return {};
  const cur =
    (await stateStore.get(STATE_KEY, { type: "json", consistency: "strong" })) || { ov: {} };
  return { ...baseJob, ...(cur.ov || {})[baseJob.id] };
}

/** Generate a QBO-style PDF from job data and store in the docs blob. */
export async function generateAndStoreDoc({ job, kind = "invoice" }) {
  if (!canGenerateLocalDoc(job, kind)) {
    return { ok: false, reason: "insufficient_data" };
  }
  const generateDocument = await loadGenerator();
  if (typeof generateDocument !== "function") {
    return { ok: false, reason: "pdf_unsupported", error: pdfLoadError() };
  }
  const data = mapJobToQbDocData(job, kind);
  let buf;
  try {
    // Workers-safe: pass font + logo bytes directly instead of reading from fs.
    // pdfkit/fontkit/png-js expect Node Buffers; nodejs_compat provides Buffer.
    const asBuf = (u) => (typeof Buffer !== "undefined" ? Buffer.from(u) : u);
    buf = await generateDocument({
      ...data,
      fontRegular: asBuf(FONT_REG_BYTES),
      fontBold: asBuf(FONT_BOLD_BYTES),
      logoBytes: asBuf(LOGO_BYTES),
    });
  } catch (err) {
    console.error("[docGenerate] generateDocument failed:", String(err?.stack || err));
    return { ok: false, reason: "pdf_error", error: String(err?.message || err).slice(0, 200) };
  }
  const key = docStoreKey(kind, data.docNumber);
  const filename = docPdfFilename(kind, job, data.docNumber);
  const store = getStore("docs");
  await store.set(key, buf, {
    metadata: { mime: "application/pdf", bytes: buf.length, ts: Date.now(), source: "local", filename },
  });
  return { ok: true, key, bytes: buf.length, docNumber: data.docNumber, pdfBuffer: buf };
}
