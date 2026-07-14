// Local invoice/estimate PDF — generate on server, store in docs (no QBO pull).
import { canGenerateLocalDoc, docStoreKey } from "./jobToQbDoc.js";
import { docStorePdfUrl } from "./pdfOpen.js";

const SITE_ORIGIN =
  (typeof window !== "undefined" && window.location?.origin) || "https://leelectrical.us";

function functionsBase() {
  if (typeof location !== "undefined" && /(^|\.)leelectrical\.us$/.test(location.hostname)) {
    return "/.netlify/functions";
  }
  return `${SITE_ORIGIN}/.netlify/functions`;
}

export const PDF_GENERATE_STAGES = ["Checking", "Generating PDF", "Ready"];

/** Ask Netlify to generate + store a local PDF from job data. */
export async function requestLocalDocGenerate(job, kind = "invoice") {
  const res = await fetch(`${functionsBase()}/generate-doc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, job }),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { ok: !!(res.ok && data.ok), data };
}

/** True when this job can skip the QBO fetch_pdf path. */
export function preferLocalDoc(job, kind = "invoice") {
  return canGenerateLocalDoc(job, kind);
}

export function localDocUrl(job, kind = "invoice") {
  const no = kind === "invoice" ? job?.invoiceNo : job?.estimateNo;
  return no ? docStorePdfUrl(docStoreKey(kind, no)) : "";
}