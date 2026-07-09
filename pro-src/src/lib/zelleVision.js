// Client — POST Zelle screenshot to Netlify vision function.
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
 * Analyze a Zelle payment screenshot via backend vision (xAI Grok).
 * @param {string} imageBase64 — raw base64, no data: prefix
 * @param {string} mime — e.g. image/png
 */
export async function analyzeZelleScreenshot(imageBase64, mime = "image/jpeg") {
  const res = await fetch(`${base()}/zelle-vision?cb=${Date.now()}`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: imageBase64, mime }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Vision failed (${res.status})`);
  }
  return data.extracted;
}