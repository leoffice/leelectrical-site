/** Speech-to-text via the xAI Grok voice API (POST https://api.x.ai/v1/stt).
 *
 * Same auth/config pattern as voicePolish.mjs and paymentVision.mjs — reads
 * XAI_API_KEY from the environment. The browser records a short audio clip,
 * base64-encodes it, and posts it here; we forward it to xAI as multipart and
 * return the plain transcript. Grok STT is what powers Grok Voice / the Point
 * Quest assistant voice — noticeably better than the browser Web Speech API,
 * and it works in Safari/iOS where webkitSpeechRecognition does not.
 */

const STT_ENDPOINT = "https://api.x.ai/v1/stt";

function base64ToBytes(b64) {
  // Strip a data: URL prefix if the client left one on.
  const clean = String(b64 || "").replace(/^data:[^,]*,/, "");
  if (typeof atob === "function") {
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  // Node fallback (local dev / vitest).
  return new Uint8Array(Buffer.from(clean, "base64"));
}

function extFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("m4a")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("wav")) return "wav";
  if (m.includes("aac")) return "aac";
  return "webm";
}

/**
 * Transcribe a base64 audio clip.
 * Without XAI_API_KEY returns { dryRun: true } so previews degrade gracefully.
 * @param {{ audioBase64: string, mime?: string, language?: string, keyterms?: string[] }} args
 */
export async function transcribeAudio({ audioBase64, mime = "audio/webm", language = "", keyterms = [] }) {
  const apiKey = process.env.XAI_API_KEY;
  if (!audioBase64) return { ok: false, text: "", error: "empty" };
  if (!apiKey) return { dryRun: true, text: "", error: "XAI_API_KEY not set" };

  const bytes = base64ToBytes(audioBase64);
  if (!bytes.length) return { ok: false, text: "", error: "empty audio" };

  const form = new FormData();
  // xAI dedicated STT endpoint infers the model; send one only if pinned.
  const model = process.env.XAI_STT_MODEL || process.env.XAI_VOICE_MODEL || "";
  if (model) form.append("model", model);
  const lang = String(language || "").trim();
  if (lang) {
    form.append("language", lang);
    form.append("format", "true"); // text normalization; requires language
  }
  for (const term of Array.isArray(keyterms) ? keyterms.slice(0, 100) : []) {
    const t = String(term || "").trim().slice(0, 50);
    if (t) form.append("keyterm", t);
  }
  // `file` must be the LAST multipart field per the xAI spec.
  const blob = new Blob([bytes], { type: mime || "audio/webm" });
  form.append("file", blob, `clip.${extFromMime(mime)}`);

  const r = await fetch(STT_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`xAI STT ${r.status}: ${err.slice(0, 200)}`);
  }

  const body = await r.json();
  const text = String(body?.text || "").trim();
  return { ok: true, text, model: model || "grok-stt", language: body?.language || lang || null, dryRun: false };
}
