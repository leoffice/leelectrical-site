/** Open PDFs in the device native viewer — blob iframes show raw PDF source on iOS/Android. */

const SITE_ORIGIN =
  (typeof window !== "undefined" && window.location?.origin) || "https://leelectrical.us";

function docsBase() {
  if (typeof location !== "undefined" && /(^|\.)leelectrical\.us$/.test(location.hostname)) {
    return "/.netlify/functions";
  }
  return `${SITE_ORIGIN}/.netlify/functions`;
}

/** Public URL for a stored invoice/estimate PDF (docs blob store). */
export function docStorePdfUrl(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  return `${docsBase()}/docs?key=${encodeURIComponent(k)}`;
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