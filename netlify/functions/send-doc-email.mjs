import { sendDocEmail } from "./lib/docEmail.mjs";
import { sendStatementEmail } from "./lib/statementEmailServer.mjs";

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
  if (kind !== "invoice" && kind !== "estimate" && kind !== "statement") {
    return json({ ok: false, error: "bad kind" }, 400);
  }

  const job = body.job || {};
  const email = String(body.email || body.to || job.email || "").trim();
  const probe = body.probe === true || body.probe === 1;
  const officeOnly = body.officeOnly === true || body.officeOnly === 1;
  // Non-probe, non-officeOnly sends still require a recipient.
  if (!email && !probe && !officeOnly) return json({ ok: false, error: "missing email" }, 400);

  try {
    // Statements are customer-level (no single job) — a self-contained branded
    // email carrying the client-generated statement PDF + per-invoice pay links.
    if (kind === "statement") {
      const result = await sendStatementEmail({
        to: email,
        officeOnly,
        probe,
        pdfB64: body.pdfB64 || body.pdfBase64 || "",
        filename: body.filename || "Statement.pdf",
        statement: body.statement || {},
      });
      return json(result, result.ok ? 200 : 502);
    }

    const includePaymentLink =
      kind === "invoice" && body.includePaymentLink !== false && body.includePaymentLink !== 0;
    const result = await sendDocEmail({
      job,
      kind,
      to: email,
      includePaymentLink,
      pdfB64: body.pdfB64 || body.pdfBase64 || "",
      filename: body.filename || "",
      message: body.message || body.topMessage || "",
      probe,
      officeOnly,
    });
    return json(result, result.ok ? 200 : 502);
  } catch (err) {
    console.error("[send-doc-email]", err);
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
};