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
  if (!image) return json({ ok: false, error: "image required" }, 400);
  if (image.length > 28_000_000) return json({ ok: false, error: "image too large" }, 413);

  try {
    const result = await extractPaymentFromImage({ imageBase64: image, mime, kind: "zelle" });
    if (result.dryRun) {
      // 422 not 502 — CF custom domains strip 502 response bodies.
      return json(
        {
          ok: false,
          dryRun: true,
          error: result.error || "Vision API not configured — set XAI_API_KEY",
        },
        422
      );
    }
    return json({ ok: true, extracted: result.extracted, model: result.model });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e).slice(0, 300) }, 422);
  }
};