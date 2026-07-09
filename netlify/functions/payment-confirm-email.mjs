import { getStore } from "@netlify/blobs";
import {
  PAYMENT_CONFIRM_COMPANY,
  buildPaymentConfirmEmail,
} from "./lib/paymentConfirmEmail.mjs";
import {
  isEmailTestMode,
  resolveFromAddress,
  resolveRecipient,
} from "./lib/paymentConfirmEnv.mjs";

export { isEmailTestMode, resolveFromAddress, resolveRecipient };

const JOBS_KEY = "jobsdata-v1";
const STATE_KEY = "ov-v1";
const SENT_KEY = "payment-confirm-sent-v1";
const RESEND_URL = "https://api.resend.com/emails";

function parseMoney(raw) {
  const n = parseFloat(String(raw ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function loadJob(jobId) {
  if (!jobId) return null;
  const jobsStore = getStore("jobsdata");
  const stateStore = getStore("jobstate");
  const jobsDoc =
    (await jobsStore.get(JOBS_KEY, { type: "json", consistency: "strong" })) || { jobs: [] };
  const baseJob = (jobsDoc.jobs || []).find((j) => String(j.id) === String(jobId)) || {};
  const cur =
    (await stateStore.get(STATE_KEY, { type: "json", consistency: "strong" })) ||
    { ov: {}, ts: 0 };
  return { ...baseJob, ...(cur.ov || {})[jobId] };
}

async function loadJobContact(jobId) {
  const merged = (await loadJob(jobId)) || {};
  const customer = String(merged.customer || "").trim();
  const email = String(merged.email || "").trim();
  const first = customer.split(/\s+/)[0] || "there";
  return { email, first, customer };
}

async function loadJobBalance(jobId) {
  const merged = await loadJob(jobId);
  if (!merged) return null;
  if (merged.paid) return 0;
  return parseMoney(merged.openBalance);
}

async function alreadySent(idempotencyKey) {
  if (!idempotencyKey) return false;
  const store = getStore("commands");
  const doc = (await store.get(SENT_KEY, { type: "json" })) || { sent: {} };
  return Boolean(doc.sent?.[idempotencyKey]);
}

async function markSent(idempotencyKey, meta) {
  if (!idempotencyKey) return;
  const store = getStore("commands");
  const doc = (await store.get(SENT_KEY, { type: "json" })) || { sent: {} };
  doc.sent = doc.sent || {};
  doc.sent[idempotencyKey] = { ...meta, ts: Date.now() };
  await store.setJSON(SENT_KEY, doc);
}

/**
 * Send automatic payment confirmation email (Resend).
 * EMAIL_TEST_MODE=true (default) routes to PAYMENT_CONFIRM_TEST_EMAIL.
 * Without RESEND_API_KEY, logs dry-run only — never throws.
 */
export async function sendPaymentConfirmEmail({
  jobId,
  invoiceNo,
  amount,
  balance,
  ref,
  payDate,
}) {
  const idk = ref
    ? `pay-confirm:${invoiceNo}:${ref}`
    : `pay-confirm:${invoiceNo}:${amount}:${payDate || "nodate"}`;

  if (await alreadySent(idk)) {
    return { ok: true, skipped: true, reason: "deduped", idempotencyKey: idk };
  }

  const { email: customerEmail, first } = await loadJobContact(jobId);
  const balanceNow =
    balance != null && balance !== ""
      ? Number(balance)
      : await loadJobBalance(jobId);
  const to = resolveRecipient(customerEmail);
  const testMode = isEmailTestMode();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = resolveFromAddress();

  const { subject, html, text } = buildPaymentConfirmEmail({
    firstName: first,
    invoiceNo,
    amountPaid: amount,
    balanceNow,
    payDate,
  });

  const meta = {
    testMode,
    intendedTo: customerEmail || "(no email on job)",
    to: to || "(unset)",
    invoiceNo,
    amount,
    balance: balanceNow,
    ref: ref || "",
    from,
  };

  if (!to) {
    console.log("[payment-confirm-email] SKIP no recipient", JSON.stringify(meta));
    return { ok: false, skipped: true, reason: testMode ? "test_email_unset" : "no_customer_email", ...meta };
  }

  if (!customerEmail && !testMode) {
    console.log("[payment-confirm-email] SKIP no customer email on job", JSON.stringify(meta));
    return { ok: false, skipped: true, reason: "no_customer_email", ...meta };
  }

  if (!apiKey) {
    console.log("[payment-confirm-email] DRY-RUN (no RESEND_API_KEY)", JSON.stringify({ ...meta, subject }));
    await markSent(idk, { ...meta, dryRun: true });
    return { ok: true, dryRun: true, reason: "no_api_key", subject, ...meta };
  }

  const payload = {
    from: `${PAYMENT_CONFIRM_COMPANY} <${from}>`,
    to: [to],
    subject: testMode ? `[TEST] ${subject}` : subject,
    html,
    text,
  };
  if (testMode && customerEmail && customerEmail !== to) {
    payload.headers = { "X-Intended-Recipient": customerEmail };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[payment-confirm-email] Resend error", res.status, body);
      return { ok: false, reason: "resend_error", status: res.status, error: body, ...meta };
    }
    await markSent(idk, { ...meta, resendId: body.id || "" });
    console.log("[payment-confirm-email] SENT", JSON.stringify({ ...meta, resendId: body.id }));
    return { ok: true, sent: true, resendId: body.id, ...meta };
  } catch (err) {
    console.error("[payment-confirm-email] fetch failed", err);
    return { ok: false, reason: "fetch_failed", error: String(err?.message || err), ...meta };
  }
}