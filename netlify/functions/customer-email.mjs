import { sendCustomerEmail } from "./lib/customerEmail.mjs";

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** POST { email, subject, message, customer? } — send composed customer email. */
export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
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
  });
  return json(result, result.ok ? 200 : 502);
};