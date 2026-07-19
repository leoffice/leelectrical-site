// Server-side STATEMENT email — a self-contained branded email carrying the
// client-generated statement PDF (pdfB64) + per-invoice pay links, sent via
// Resend. Mirrors docEmail.mjs's safety model (probe / officeOnly / testMode /
// dry-run when RESEND_API_KEY is unset). Statements are customer-level, so this
// does NOT go through mapJobToQbDocData.
import {
  isEmailTestMode,
  resolveFromAddress,
  resolveRecipient,
} from "./paymentConfirmEnv.mjs";
import { LOGO_PNG_BASE64 } from "./le-invoice-suite/logoBase64.mjs";
import { poweredByLeHtml, resolveEmailBrand } from "./emailBranding.mjs";

const RESEND_URL = "https://api.resend.com/emails";
const OFFICE_EMAIL = "office@leelectrical.us";
const GREEN = "#066a34";

function money(n) {
  return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodePdfB64(b64) {
  const raw = String(b64 || "").replace(/^data:[^;]*;base64,/, "").trim();
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  return buf.length > 4 && buf.slice(0, 4).toString("latin1") === "%PDF" ? buf : null;
}

export function buildStatementHtml(st) {
  const companyName = esc(st.company?.name || "BLZ Electric");
  const rows = (st.payRows || [])
    .map(
      (r) =>
        `<tr>
           <td style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px;">Invoice #${esc(r.inv)}</td>
           <td style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px;text-align:right;">$${money(r.amount)}</td>
           <td style="padding:6px 0 6px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;">
             <a href="${esc(r.url)}" style="color:${GREEN};font-weight:bold;text-decoration:none;">View &amp; Pay ›</a>
           </td>
         </tr>`
    )
    .join("");
  // Header brand = tenant; footer = constant Powered by LE.
  const brand = resolveEmailBrand({ name: companyName, logoUrl: st.company?.logoUrl });
  return `<!doctype html><html><body style="margin:0;background:#f6f7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    <div style="background:${GREEN};padding:16px 24px;">
      <img src="${brand.logoSrc}" alt="${companyName}" height="40" style="vertical-align:middle;" />
      <span style="color:#fff;font-weight:bold;font-size:16px;margin-left:10px;vertical-align:middle;">${companyName}</span>
    </div>
    <div style="padding:24px;">
      <h2 style="color:${GREEN};margin:0 0 4px;font-size:20px;">Account Statement</h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">${esc(st.typeLabel || "")}${
        st.periodLabel ? " · " + esc(st.periodLabel) : ""
      }</p>
      <p style="font-size:14px;">Dear ${esc(st.billToName || "Customer")},</p>
      <p style="font-size:14px;">Your account statement is attached. Balance due:
        <b style="color:${GREEN};">$${money(st.totalDue || 0)}</b>.</p>
      ${
        rows
          ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
               <thead><tr>
                 <th style="text-align:left;font-size:11px;color:#9ca3af;border-bottom:2px solid ${GREEN};padding-bottom:4px;">INVOICE</th>
                 <th style="text-align:right;font-size:11px;color:#9ca3af;border-bottom:2px solid ${GREEN};padding-bottom:4px;">BALANCE</th>
                 <th style="text-align:right;font-size:11px;color:#9ca3af;border-bottom:2px solid ${GREEN};padding-bottom:4px;"></th>
               </tr></thead>
               <tbody>${rows}</tbody>
             </table>
             <p style="font-size:12px;color:#6b7280;">Each invoice in the attached PDF is also individually clickable to view and pay.</p>`
          : `<p style="font-size:13px;color:#6b7280;">See the attached PDF for full details.</p>`
      }
      <p style="font-size:13px;color:#6b7280;margin-top:20px;">Questions? Reply to this email or call us anytime.<br/>Thank you — ${companyName}</p>
    </div>
    ${poweredByLeHtml()}
  </div></body></html>`;
}

/**
 * @param {object} args { to, officeOnly, probe, pdfB64, filename, statement }
 */
export async function sendStatementEmail({ to, officeOnly = false, probe = false, pdfB64, filename, statement = {} }) {
  const email = String(to || statement.email || "").trim();

  if (probe) {
    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    return {
      ok: true,
      probe: true,
      hasResendKey: !!apiKey,
      testMode: isEmailTestMode(),
      from: resolveFromAddress(),
      wouldSendTo: officeOnly ? OFFICE_EMAIL : resolveRecipient(email) || "(unset)",
      kind: "statement",
    };
  }

  const pdfBuffer = decodePdfB64(pdfB64);
  if (!pdfBuffer) return { ok: false, reason: pdfB64 ? "bad_client_pdf" : "pdf_required", kind: "statement" };

  const recipient = officeOnly ? OFFICE_EMAIL : resolveRecipient(email);
  const testMode = isEmailTestMode();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = resolveFromAddress();
  const companyName = statement.company?.name || "BLZ Electric";
  const subject = statement.subject || `Statement from ${companyName} — $${money(statement.totalDue || 0)} due`;

  const meta = {
    testMode,
    officeOnly,
    kind: "statement",
    intendedTo: email || OFFICE_EMAIL,
    to: recipient || "(unset)",
    from,
    subject,
  };

  if (!recipient) return { ok: false, skipped: true, reason: testMode ? "test_email_unset" : "no_recipient", ...meta };
  if (officeOnly && recipient.toLowerCase() !== OFFICE_EMAIL) {
    return { ok: false, skipped: true, reason: "office_only_guard", ...meta };
  }

  const html = buildStatementHtml(statement);
  const text =
    `Account statement from ${companyName}\n` +
    `Balance due: $${money(statement.totalDue || 0)}\n\n` +
    (statement.payRows || []).map((r) => `Invoice #${r.inv}: $${money(r.amount)} — ${r.url}`).join("\n");

  if (!apiKey) {
    console.log("[statement-email] DRY-RUN (no RESEND_API_KEY)", JSON.stringify(meta));
    return { ok: true, dryRun: true, reason: "no_api_key", ...meta };
  }

  const payload = {
    from: `${companyName} <${from}>`,
    to: [recipient],
    subject: testMode ? `[TEST] ${subject}` : subject,
    html,
    text,
    attachments: [
      { filename: filename || "Statement.pdf", content: pdfBuffer.toString("base64") },
      { filename: "logo.png", content: LOGO_PNG_BASE64, content_id: "companylogo" },
    ],
  };
  if (testMode && email && email !== recipient) payload.headers = { "X-Intended-Recipient": email };

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const bodyJson = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[statement-email] Resend error", res.status, bodyJson);
      return { ok: false, reason: "resend_error", status: res.status, error: bodyJson, ...meta };
    }
    console.log("[statement-email] SENT", JSON.stringify({ ...meta, resendId: bodyJson.id }));
    return { ok: true, sent: true, resendId: bodyJson.id, ...meta };
  } catch (err) {
    console.error("[statement-email] fetch failed", err);
    return { ok: false, reason: "fetch_failed", error: String(err?.message || err), ...meta };
  }
}
