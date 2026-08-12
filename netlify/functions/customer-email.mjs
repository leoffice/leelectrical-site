import { sendCustomerEmail } from "./lib/customerEmail.mjs";
import { authorizeSend } from "./lib/sendAuth.mjs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-le-email-key",
};

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });
}

/** POST { email, subject, message, customer? } — send composed customer email. */
export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  // Outbound branded mail — never anonymous (spoofing/spam vector).
  const auth = await authorizeSend(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  const email = String(body.email || body.to || "").trim();
  if (!email) return json({ ok: false, error: "missing email" }, 400);
  const result = await sendCustomerEmail({
    to: email,
    subject: body.subject,
    message: body.message,
    customerEmail: email,
    ctaLabel: body.ctaLabel || body.cta_label || "",
    ctaUrl: body.ctaUrl || body.cta_url || body.ctaHref || "",
    htmlBody: body.htmlBody || body.html_body || body.html || "",
  });
  return json(result, result.ok ? 200 : 502);
};
