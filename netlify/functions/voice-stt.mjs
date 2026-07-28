import { transcribeAudio } from "./lib/voiceStt.mjs";

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
  });
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const audioBase64 = String(body.audio || body.audioBase64 || "").trim();
  const mime = String(body.mime || "audio/webm").trim();
  const language = String(body.language || "").trim();
  const keyterms = Array.isArray(body.keyterms) ? body.keyterms : [];
  if (!audioBase64) return json({ ok: false, error: "audio required" }, 400);
  // Dictation clips are short; guard against oversized payloads (~18 MB base64).
  if (audioBase64.length > 18_000_000) return json({ ok: false, error: "audio too large" }, 413);

  try {
    const result = await transcribeAudio({ audioBase64, mime, language, keyterms });
    if (result.dryRun) {
      // 422 (not 502) so custom domains on Cloudflare keep the JSON body intact.
      return json(
        { ok: false, dryRun: true, error: result.error || "STT not configured — set XAI_API_KEY" },
        422
      );
    }
    return json({ ok: true, text: result.text, model: result.model, language: result.language });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e).slice(0, 300) }, 422);
  }
};
