/** Public pay page — check / poll / request invoice PDFs from the docs store. */

const SITE_ORIGIN =
  (typeof window !== "undefined" && window.location?.origin) || "https://leelectrical.us";

export const PDF_RETRIEVE_STAGES = ["Requesting", "Fetching from QuickBooks", "Ready"];

export function docsFetchUrl() {
  return `${SITE_ORIGIN}/.netlify/functions/docs-fetch`;
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

/** Ask Netlify to enqueue fetch_pdf (Mac command_listener pulls from QBO). */
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
  return !!(res.ok && data.ok);
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
 * Full customer flow: check docs → enqueue QBO fetch if missing → poll → ready.
 * onPhase: idle | checking | requesting | fetching | ready | timeout
 */
export async function retrieveInvoicePdf({ url, invoiceNo, jobId = "", onPhase }) {
  onPhase?.("checking");
  if (await invoicePdfAvailable(url)) {
    onPhase?.("ready");
    return true;
  }
  onPhase?.("requesting");
  const queued = await requestInvoicePdfFetch(invoiceNo, jobId);
  if (!queued) {
    onPhase?.("timeout");
    return false;
  }
  onPhase?.("fetching");
  const ok = await waitForInvoicePdf(url);
  onPhase?.(ok ? "ready" : "timeout");
  return ok;
}