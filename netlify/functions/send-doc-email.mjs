import { sendDocEmail } from "./lib/docEmail.mjs";

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

/** POST { kind, job, email?, includePaymentLink? } — local PDF + QBO-style email via Resend. */
export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const kind = String(body.kind || "invoice").toLowerCase();
  if (kind !== "invoice" && kind !== "estimate") {
    return json({ ok: false, error: "bad kind" }, 400);
  }

  const job = body.job || {};
  const email = String(body.email || body.to || job.email || "").trim();
  if (!email) return json({ ok: false, error: "missing email" }, 400);

  const includePaymentLink =
    kind === "invoice" && body.includePaymentLink !== false && body.includePaymentLink !== 0;

  try {
    const result = await sendDocEmail({ job, kind, to: email, includePaymentLink });
    return json(result, result.ok ? 200 : 502);
  } catch (err) {
    console.error("[send-doc-email]", err);
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
};