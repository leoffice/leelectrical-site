/** Open PDFs in the device native viewer — blob iframes show raw PDF source on iOS/Android. */
import { functionsBase } from "./functionsBase.js";

/** Public URL for a stored invoice/estimate PDF (docs blob store). */
export function docStorePdfUrl(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  return `${functionsBase()}/docs?key=${encodeURIComponent(k)}`;
}

/** Open a PDF URL in a new tab so the browser/OS renders it natively. */
export function openPdfUrl(url) {
  if (!url || typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Open a generated PDF blob via a short-lived object URL. */
export function openPdfBlob(blob) {
  if (!blob || typeof URL === "undefined" || !URL.createObjectURL) return;
  const url = URL.createObjectURL(blob);
  openPdfUrl(url);
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }, 120_000);
}

/**
 * Download a generated PDF blob with a filename — the reliable cross-device
 * path (mobile browsers open blob-URL new tabs inconsistently; a download lands
 * in the native PDF viewer). Mirrors the working requisition PDF download.
 * Prefer LocalDocViewer for “View Local” so users can read first, then download.
 */
export function downloadPdfBlob(blob, filename = "document.pdf") {
  if (!blob || typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }, 120_000);
}

/**
 * Share a PDF via the device share sheet when available.
 * @returns {Promise<"shared"|"aborted"|"unsupported">}
 */
export async function sharePdfBlob(blob, filename = "document.pdf", title = "Document") {
  if (!blob || typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unsupported";
  }
  try {
    const name = String(filename || "document.pdf").replace(/[^\w.\- ()]+/g, "_") || "document.pdf";
    const file =
      typeof File !== "undefined"
        ? new File([blob], name, { type: blob.type || "application/pdf" })
        : null;
    if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: title || name });
      return "shared";
    }
    // Some browsers share title only — still better than a forced download.
    await navigator.share({ title: title || name, text: title || name });
    return "shared";
  } catch (err) {
    if (err && (err.name === "AbortError" || /abort/i.test(String(err.message || "")))) {
      return "aborted";
    }
    return "unsupported";
  }
}