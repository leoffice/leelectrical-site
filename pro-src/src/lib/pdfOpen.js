/** Open PDFs in the device native viewer — blob iframes show raw PDF source on iOS/Android. */
import { functionsBase } from "./functionsBase.js";

/** Public URL for a stored invoice/estimate PDF (docs blob store). */
export function docStorePdfUrl(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  return `${functionsBase()}/docs?key=${encodeURIComponent(k)}`;
}

/**
 * True when embedding a PDF (blob or remote) in an iframe will not show pages.
 * iPhone/iPad and many Android WebViews show a blank/UUID placeholder instead.
 */
export function pdfInlinePreviewSupported() {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  const ios =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return false;
  if (/android/i.test(ua)) return false;
  return true;
}

/** Force application/pdf so iOS Quick Look / share treat the file as a real invoice. */
export function ensurePdfBlob(blob) {
  if (!blob) return null;
  if (blob.type === "application/pdf") return blob;
  try {
    return new Blob([blob], { type: "application/pdf" });
  } catch {
    return blob;
  }
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
  const pdf = ensurePdfBlob(blob);
  if (!pdf || typeof URL === "undefined" || !URL.createObjectURL) return;
  const url = URL.createObjectURL(pdf);
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
  const pdf = ensurePdfBlob(blob);
  if (!pdf || typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return;
  const url = URL.createObjectURL(pdf);
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
 * Best-effort “show me the PDF” on the current device.
 * Mobile: download with a real filename (opens native PDF viewer on iOS/Android).
 * Desktop / when only a remote URL is available: open in a new tab.
 */
export function openPdfForNativeView({ blob, url, filename = "document.pdf" } = {}) {
  const pdf = ensurePdfBlob(blob);
  if (pdf) {
    // Filename download is the path that actually shows pages on phone Safari/Chrome.
    downloadPdfBlob(pdf, filename);
    return "download";
  }
  if (url) {
    openPdfUrl(url);
    return "url";
  }
  return "noop";
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
    const pdf = ensurePdfBlob(blob) || blob;
    const name = String(filename || "document.pdf").replace(/[^\w.\- ()]+/g, "_") || "document.pdf";
    const file =
      typeof File !== "undefined"
        ? new File([pdf], name, { type: "application/pdf" })
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
