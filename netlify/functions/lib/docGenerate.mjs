import { getStore } from "./storage/index.mjs";
import { canGenerateLocalDoc, docPdfFilename, docStoreKey, mapJobToQbDocData } from "./jobToQbDoc.mjs";

// NOTE: the pdfkit generator + Node fs/path/module bits load lazily inside
// generateAndStoreDoc(), NOT at module load. This module is transitively imported
// by docs-fetch, which must load on Cloudflare's V8 isolate — where import.meta.url
// is undefined and pdfkit can't run. Deferring keeps import crash-free; only an
// actual generateAndStoreDoc() call (Node only) touches those APIs.

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
  // Lazy Node-only deps — pdfkit and fs/path/module can't run on Cloudflare V8.
  const { createRequire } = await import("module");
  const { fileURLToPath } = await import("url");
  const path = (await import("path")).default;
  const require = createRequire(import.meta.url);
  const { generateDocument } = require("./le-invoice-suite/qb-pdf.js");
  const SUITE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "le-invoice-suite");
  const data = mapJobToQbDocData(job, kind);
  data.logoPath = path.join(SUITE_DIR, "assets", "logo.png");
  const buf = await generateDocument(data);
  const key = docStoreKey(kind, data.docNumber);
  const filename = docPdfFilename(kind, job, data.docNumber);
  const store = getStore("docs");
  await store.set(key, buf, {
    metadata: { mime: "application/pdf", bytes: buf.length, ts: Date.now(), source: "local", filename },
  });
  return { ok: true, key, bytes: buf.length, docNumber: data.docNumber, pdfBuffer: buf };
}