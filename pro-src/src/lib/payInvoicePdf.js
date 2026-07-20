/** Public pay page — check / poll / request invoice PDFs from the docs store. */
import { functionsBase } from "./functionsBase.js";

// Customer-facing wording only. The PDF is rendered server-side and cached in
// R2, so there is no "waiting on the office computer" state to describe — and a
// customer must never be shown one.
export const PDF_RETRIEVE_STAGES = ["Checking", "Preparing", "Ready"];

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

/** Ask the Pages Function to render the PDF server-side and cache it to R2. */
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
  typeof import.meta !== "undefined" && import.meta.vitest ? 25 : 1500;

/**
 * Poll until the PDF lands or we run out of time.
 *
 * The window is short (it was 90s back when it covered an office Mac waking up
 * and driving QuickBooks). Server-side rendering is immediate, so this only
 * absorbs R2 read-after-write lag.
 */
export async function waitForInvoicePdf(
  url,
  { intervalMs = defaultPollMs, timeoutMs = 12000 } = {}
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await invoicePdfAvailable(url)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Full customer flow: ask the server to render+cache, then read it back.
 * onPhase: idle | checking | requesting | fetching | ready | timeout
 */
export async function retrieveInvoicePdf({ url, invoiceNo, jobId = "", onPhase }) {
  onPhase?.("checking");
  // A cached R2 copy is the common case (written when the invoice was emailed),
  // so try a plain read before asking the server to do any work.
  if (await invoicePdfAvailable(url)) {
    onPhase?.("ready");
    return true;
  }

  onPhase?.("requesting");
  const result = await requestInvoicePdfFetch(invoiceNo, jobId);
  if (await invoicePdfAvailable(url)) {
    onPhase?.("ready");
    return true;
  }

  // Either the render succeeded and R2 hasn't caught up, or it genuinely
  // couldn't render. Both look the same to the customer: keep waiting briefly.
  onPhase?.("fetching");
  const ok = await waitForInvoicePdf(url, result.ok ? undefined : { timeoutMs: 6000 });
  onPhase?.(ok ? "ready" : "timeout");
  return ok;
}
