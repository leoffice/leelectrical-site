// Chat bubble file helpers — any file type, not just images.
import { fileToBase64 } from "./paymentVision.js";
import { functionsBase as base } from "./functionsBase.js";

const TEXT_EXCERPT_MAX = 8000;
const TEXT_INLINE_MAX = 32_000;
const UPLOAD_MAX = 9_000_000;

export function isImageFile(file) {
  if (!file) return false;
  if (String(file.type || "").startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(file.name || "");
}

export function isTextFile(file) {
  const t = String(file.type || "");
  if (t.startsWith("text/")) return true;
  if (t === "application/json" || t === "application/xml") return true;
  return /\.(txt|csv|md|json|xml|log)$/i.test(file.name || "");
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10_240 ? 1 : 0) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

function safeKeyPart(name) {
  return String(name || "file")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 40);
}

export async function readTextExcerpt(file, maxLen = TEXT_EXCERPT_MAX) {
  if (!file || !isTextFile(file) || file.size > TEXT_INLINE_MAX) return "";
  try {
    return String(await file.text()).slice(0, maxLen);
  } catch {
    return "";
  }
}

/** Store a chat attachment in the docs blob store; returns a fetchable URL. */
export async function uploadChatAttachment(file) {
  if (!file || file.size > UPLOAD_MAX) throw new Error("file too large");
  const b64 = await fileToBase64(file);
  const key = `chat-${Date.now()}-${safeKeyPart(file.name)}`;
  const res = await fetch(`${base()}/docs?cb=${Date.now()}`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      op: "put",
      key,
      b64,
      mime: file.type || "application/octet-stream",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `upload failed (${res.status})`);
  return `${base()}/docs?key=${encodeURIComponent(key)}`;
}

export function buildChatFileLine(file, { fileUrl = "", excerpt = "" } = {}) {
  const sizeStr = formatFileSize(file.size);
  let line = `Attached file: ${file.name} (${sizeStr})`;
  if (fileUrl) line += ` — ${fileUrl}`;
  if (excerpt) line += `\n\n${excerpt}`;
  return line;
}