/** Public pay page — check / poll / request invoice PDFs from the docs store. */
import { functionsBase } from "./functionsBase.js";
import { buildInvoicePdfBlobFromPayload } from "./estimateLanding.js";

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

function inTestEnv() {
  return (
    (typeof import.meta !== "undefined" && import.meta.vitest) ||
    (typeof process !== "undefined" &&
      (process.env.VITEST || process.env.NODE_ENV === "test"))
  );
}

function pollIntervalMs() {
  return inTestEnv() ? 25 : 3000;
}

/** Poll until the PDF lands (host fetch_pdf) or timeout. */
export async function waitForInvoicePdf(
  url,
  { intervalMs = pollIntervalMs(), timeoutMs = 90000 } = {}
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await invoicePdfAvailable(url)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Full customer flow: store/docs-fetch first, then client-built PDF from the
 * pay link payload (no office computer required).
 * onPhase: idle | checking | requesting | fetching | ready | timeout
 * Returns { ok, blobUrl? } — blobUrl is set when we built the PDF in-browser.
 */
export async function retrieveInvoicePdf({
  url,
  invoiceNo,
  jobId = "",
  payload = null,
  onPhase,
}) {
  onPhase?.("checking");
  if (url && (await invoicePdfAvailable(url))) {
    onPhase?.("ready");
    return { ok: true };
  }
  onPhase?.("requesting");
  const result = await requestInvoicePdfFetch(invoiceNo, jobId).catch(() => ({ ok: false }));
  if (result.ok && url && (await invoicePdfAvailable(url))) {
    onPhase?.("ready");
    return { ok: true };
  }
  if (result.ok && result.queued && url) {
    onPhase?.("fetching");
    // Short poll — then fall through to client PDF so customers aren't stuck.
    const interval = pollIntervalMs();
    const pollTimeout = interval < 100 ? 120 : 12_000;
    const ok = await waitForInvoicePdf(url, {
      intervalMs: interval,
      timeoutMs: pollTimeout,
    });
    if (ok) {
      onPhase?.("ready");
      return { ok: true };
    }
  }
  // Client-side fallback — same layout as office PDFs, built from the pay link.
  if (payload) {
    try {
      const built = await buildInvoicePdfBlobFromPayload(payload);
      if (built.ok && built.blob) {
        const blobUrl = URL.createObjectURL(built.blob);
        onPhase?.("ready");
        return { ok: true, blobUrl, blob: built.blob };
      }
    } catch {
      /* fall through */
    }
  }
  onPhase?.("timeout");
  return { ok: false };
}