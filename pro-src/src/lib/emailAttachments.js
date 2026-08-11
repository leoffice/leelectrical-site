// Extra email attachments for a document send — the letterhead letter that
// rides along with its invoice, plus any file the user attached in the builder.
//
// Levi 2026-08-10: sending an invoice that had an approved Load Letter mailed
// ONLY the invoice PDF. The letter was stored on the job and shown in the
// builder, but no layer of the send path carried it: the client posted just
// pdfB64 + filename, and the server built the Resend payload from that alone.
// This module produces the base64 parts that now travel with the invoice so
// both documents land in the SAME email.
//
// Letter parts are re-rendered from the stored draft rather than downloaded:
// the letterhead writer is synchronous and offline-safe, so a flaky upload URL
// (or an expired/CORS-blocked one) can never silently drop the letter. Other
// attachments fall back to fetching their URL, best-effort.

/** Resend caps a message at 40MB; stay well under once base64 inflation is counted. */
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

const isOn = (att) => att && att.attachToEmail !== false;

function safeName(name, fallback) {
  const n = String(name || "").trim() || fallback;
  return /\.[a-z0-9]{2,5}$/i.test(n) ? n : n + ".pdf";
}

/** Uint8Array → base64 without blowing the call stack on large files. */
function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  if (typeof btoa === "function") return btoa(bin);
  return Buffer.from(bin, "binary").toString("base64");
}

async function fetchAsBase64(url) {
  if (!url || typeof fetch !== "function") return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (!buf || !buf.byteLength) return null;
    return { b64: bytesToBase64(new Uint8Array(buf)), bytes: buf.byteLength };
  } catch {
    return null;
  }
}

/**
 * Render one letter draft to base64 PDF bytes (no network).
 * @returns {{ b64: string, bytes: number } | null}
 */
async function letterAsBase64(draft) {
  try {
    const { buildLetterheadPdfWithPhotos } = await import("./letterheadPdf.js");
    // Photo pages are part of the letter, so the emailed copy carries them too.
    const bytes = await buildLetterheadPdfWithPhotos({ draft });
    if (!bytes || !bytes.length) return null;
    return { b64: bytesToBase64(bytes), bytes: bytes.length };
  } catch {
    return null;
  }
}

/**
 * Build the extra-attachment parts for a document email.
 *
 * @param {object} opts
 * @param {Array<{id?:string,name?:string,url?:string,mime?:string,attachToEmail?:boolean,letterId?:string}>} [opts.attachments]
 * @param {Array<object>} [opts.letterDrafts] letter drafts stored on the job
 * @param {number} [opts.maxTotalBytes]
 * @returns {Promise<Array<{ filename: string, contentB64: string, mime?: string, letterId?: string }>>}
 */
export async function buildEmailAttachmentParts({
  attachments = [],
  letterDrafts = [],
  maxTotalBytes = MAX_TOTAL_BYTES,
} = {}) {
  const rows = Array.isArray(attachments) ? attachments.filter(isOn) : [];
  const drafts = Array.isArray(letterDrafts) ? letterDrafts : [];
  const out = [];
  const seen = new Set();
  let total = 0;

  for (const att of rows) {
    const key = att.letterId || att.url || att.id || att.name;
    if (!key || seen.has(key)) continue;
    seen.add(key);

    let part = null;
    let mime = att.mime || "application/pdf";

    // A letter always re-renders from its draft — never depends on the upload.
    if (att.letterId) {
      const draft = drafts.find((d) => d && d.id === att.letterId);
      if (draft) {
        part = await letterAsBase64(draft);
        mime = "application/pdf";
      }
    }
    if (!part && att.url) part = await fetchAsBase64(att.url);
    if (!part) continue;

    if (total + part.bytes > maxTotalBytes) continue;
    total += part.bytes;
    out.push({
      filename: safeName(att.name, att.letterId ? "Letter.pdf" : "Attachment.pdf"),
      contentB64: part.b64,
      mime,
      ...(att.letterId ? { letterId: att.letterId } : {}),
    });
  }

  return out;
}

/**
 * Letter drafts that belong on a document email — approved letters attached to
 * this job. Used when the caller has a job but no explicit attachment rows.
 */
export function letterAttachmentsFromJob(job) {
  const atts = Array.isArray(job?.attachments) ? job.attachments : [];
  return atts.filter((a) => a && a.letterId && isOn(a));
}
