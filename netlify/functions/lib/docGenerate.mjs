import { getStore } from "./storage/index.mjs";
import { canGenerateLocalDoc, docPdfFilename, docStoreKey, mapJobToQbDocData } from "./jobToQbDoc.mjs";
import { buildQbDocPdfBytes } from "../../../shared/qbDocPdf.mjs";

// Renders invoice/estimate PDFs with the shared pure-JS byte-writer from
// shared/qbDocPdf.mjs — the same renderer the browser uses. It replaced the old
// pdfkit template, which needed Node's fs/path/module and so could never run
// here: that limitation is exactly why the customer pay page used to fall back
// to fetching PDFs off the office Mac. Generation now works on Cloudflare's V8
// isolate, so docs-fetch can serve a customer with the office machine offline.
// Keep this module free of Node built-ins.

const JOBS_KEY = "jobsdata-v1";
const STATE_KEY = "ov-v1";

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
  const data = mapJobToQbDocData(job, kind);
  // The logo is embedded in the renderer (shared/leLogoJpeg.mjs), so there is
  // no logoPath to resolve off disk any more.
  const buf = buildQbDocPdfBytes(data);
  const key = docStoreKey(kind, data.docNumber);
  const filename = docPdfFilename(kind, job, data.docNumber);
  const store = getStore("docs");
  await store.set(key, buf, {
    metadata: { mime: "application/pdf", bytes: buf.length, ts: Date.now(), source: "local", filename },
  });
  return { ok: true, key, bytes: buf.length, docNumber: data.docNumber, pdfBuffer: buf };
}