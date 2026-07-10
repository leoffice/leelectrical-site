// Client — POST payment screenshot (Zelle or check) to Netlify vision function.
const REMOTE = "https://leelectrical.us/.netlify/functions";

function base() {
  if (typeof location !== "undefined" && /(^|\.)leelectrical\.us$/.test(location.hostname)) {
    return "/.netlify/functions";
  }
  return REMOTE;
}

/** Read a File as base64 (no data: prefix). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || "");
      const b64 = data.includes(",") ? data.split(",")[1] : data;
      resolve(b64);
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Analyze a payment screenshot via backend vision.
 * @param {string} imageBase64 — raw base64, no data: prefix
 * @param {string} mime — e.g. image/png
 * @param {"zelle"|"check"} kind
 */
export async function analyzePaymentScreenshot(imageBase64, mime = "image/jpeg", kind = "zelle") {
  const k = kind === "check" ? "check" : "zelle";
  const res = await fetch(`${base()}/payment-vision?cb=${Date.now()}`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: imageBase64, mime, kind: k }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Vision failed (${res.status})`);
  }
  return data.extracted;
}

/** Back-compat — Zelle screenshots. */
export async function analyzeZelleScreenshot(imageBase64, mime = "image/jpeg") {
  return analyzePaymentScreenshot(imageBase64, mime, "zelle");
}

/** Guess payment kind from vision output or filename hint. */
export function detectPaymentKind(extracted, fileName = "") {
  if (extracted?.kind === "check" || extracted?.checkNumber) return "check";
  const hay = (extracted?.confirmationNumber || "") + " " + (fileName || "");
  if (/^jpm/i.test(hay) || /zelle/i.test(fileName || "")) return "zelle";
  if (extracted?.checkNumber || /\bcheck\b/i.test(fileName || "")) return "check";
  if (extracted?.confirmationNumber) return "zelle";
  return null;
}