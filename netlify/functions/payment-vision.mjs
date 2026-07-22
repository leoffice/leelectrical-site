import { extractPaymentFromImage } from "./lib/paymentVision.mjs";

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS" },
    });
  }
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  const image = String(body.image || "").trim();
  const mime = String(body.mime || "image/jpeg").trim();
  const rawKind = String(body.kind || "zelle").trim().toLowerCase();
  const kind = rawKind === "check" ? "check" : rawKind === "intent" ? "intent" : "zelle";
  // Levi's field corrections from prior photos — few-shot training for the reader.
  const learningHint = String(body.learningHint || "").slice(0, 4000);
  if (!image) return json({ ok: false, error: "image required" }, 400);
  if (image.length > 28_000_000) return json({ ok: false, error: "image too large" }, 413);

  try {
    const result = await extractPaymentFromImage({ imageBase64: image, mime, kind, learningHint });
    if (result.dryRun) {
      // 422 not 502 — custom domains on Cloudflare replace bare 502 bodies with "error code: 502"
      // and the app loses the real reason (then pretends the check was unreadable).
      return json(
        {
          ok: false,
          dryRun: true,
          error: result.error || "Vision API not configured — set XAI_API_KEY",
        },
        422
      );
    }
    return json({ ok: true, extracted: result.extracted, model: result.model, kind: result.kind });
  } catch (e) {
    // Application failure (bad key, unreadable image, model error) — NOT a gateway 502.
    // Status 422 keeps the JSON body intact on leelectrical.us (CF strips 502 bodies).
    return json({ ok: false, error: String(e.message || e).slice(0, 300) }, 422);
  }
};