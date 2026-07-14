import { needsSmartPolish, rewriteVoiceDictation } from "./lib/voicePolish.mjs";

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type",
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

  const raw = String(body.raw || "").trim();
  const prePolished = String(body.prePolished || body.text || "").trim();
  if (!prePolished && !raw) return json({ ok: false, error: "empty" }, 400);

  try {
    const result = await rewriteVoiceDictation({ text: raw, prePolished });
    return json({
      ok: true,
      text: result.text,
      smart: true,
      dryRun: !!result.dryRun,
      model: result.model || null,
      needsSmart: needsSmartPolish(raw || prePolished),
    });
  } catch (e) {
    return json({
      ok: false,
      error: String(e?.message || e).slice(0, 300),
      fallback: prePolished,
    });
  }
};