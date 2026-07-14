/** Public pay page — check / poll / request invoice PDFs from the docs store. */
import { functionsBase } from "./functionsBase.js";

export const PDF_RETRIEVE_STAGES = ["Checking", "Generating PDF", "Ready"];

export function docsFetchUrl() {
  return `${functionsBase()}/docs-fetch`;
}

export async function invoicePdfAvailable(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const ct = (res.headers && res.headers.get && res.headers.get("content-type")) || "";
    return res.ok && ct.includes("pdf");
  } catch {
    return false;
  }
}

/** Ask Netlify to generate locally or enqueue fetch_pdf (QBO fallback). */
export async function requestInvoicePdfFetch(invoiceNo, jobId = "") {
  const res = await fetch(docsFetchUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ invoiceNo, jobId }),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { ok: !!(res.ok && data.ok), ...data };
}

const defaultPollMs =
  typeof import.meta !== "undefined" && import.meta.vitest ? 25 : 3000;

/** Poll until the PDF lands (host fetch_pdf) or timeout. */
export async function waitForInvoicePdf(
  url,
  { intervalMs = defaultPollMs, timeoutMs = 90000 } = {}
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await invoicePdfAvailable(url)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Full customer flow: generate local QBO-clone PDF when possible, else QBO fetch.
 * onPhase: idle | checking | requesting | fetching | ready | timeout
 */
export async function retrieveInvoicePdf({ url, invoiceNo, jobId = "", onPhase }) {
  onPhase?.("checking");
  onPhase?.("requesting");
  const result = await requestInvoicePdfFetch(invoiceNo, jobId);
  if (!result.ok) {
    onPhase?.("timeout");
    return false;
  }
  if (await invoicePdfAvailable(url)) {
    onPhase?.("ready");
    return true;
  }
  if (result.queued) {
    onPhase?.("fetching");
    const ok = await waitForInvoicePdf(url);
    onPhase?.(ok ? "ready" : "timeout");
    return ok;
  }
  onPhase?.("timeout");
  return false;
}