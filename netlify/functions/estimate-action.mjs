// Public estimate landing actions — Approve, Generate Invoice with 50% Deposit.
// Authenticated only by the short /pay link code (same store as pay-link).

import { getStore } from "./lib/storage/index.mjs";
import { sendDocEmail } from "./lib/docEmail.mjs";
import emailTemplate from "./lib/le-invoice-suite/email-template.js";
import { buildEmailPayLandingPayload, mintShortPayLink } from "./lib/payLandingLink.mjs";
import {
  CODE_RE,
  COMMANDS_KEY,
  JOBS_KEY,
  STATE_KEY,
  buildDepositJobFromPayload,
  createInvoicePayloadFromJob,
  depositInvoiceNo,
  isEstimatePayload,
  money,
  parseMoney,
  todayISO,
} from "./lib/estimateLanding.mjs";

const { buildPayLink } = emailTemplate;

function corsHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

async function loadPayRecord(code) {
  const store = getStore("paylinks");
  const raw = await store.get(`pl-${code}`, { type: "text" });
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function savePayRecord(code, record) {
  const store = getStore("paylinks");
  await store.set(`pl-${code}`, JSON.stringify(record), {
    metadata: {
      invoiceNo: String(record.invoiceNo || record.payload?.i || ""),
      ts: Date.now(),
    },
  });
}

async function enqueueCommand({ type, jobId, payload, idempotencyKey, lane = "deterministic" }) {
  const store = getStore("commands");
  const doc =
    (await store.get(COMMANDS_KEY, { type: "json", consistency: "strong" })) ||
    { commands: [], seq: 0, ts: 0 };
  if (idempotencyKey) {
    const existing = (doc.commands || []).find(
      (c) => c.idempotencyKey === idempotencyKey && c.status !== "failed"
    );
    if (existing) return { deduped: true, command: existing };
  }
  const now = Date.now();
  doc.seq = (doc.seq || 0) + 1;
  const command = {
    id: "c" + now + Math.random().toString(36).slice(2, 6),
    num: doc.seq,
    type,
    jobId: jobId || "",
    lane,
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    payload: payload || {},
    idempotencyKey: idempotencyKey || "",
    createdAt: now,
    updatedAt: now,
    result: null,
    error: null,
    escalatedAt: 0,
    audit: [{ ts: now, status: "queued", note: "estimate-landing" }],
  };
  doc.commands = doc.commands || [];
  doc.commands.push(command);
  doc.ts = now;
  await store.setJSON(COMMANDS_KEY, doc);
  return { deduped: false, command };
}

async function patchJobEstimateAction(jobId, patch) {
  if (!jobId) return;
  const stateStore = getStore("jobstate");
  const cur =
    (await stateStore.get(STATE_KEY, { type: "json", consistency: "strong" })) ||
    { ov: {}, ts: 0 };
  const ov = cur.ov || {};
  const prev = ov[jobId] || {};
  const nextStatus = {
    ...(prev.status || {}),
    ...(patch.status || {}),
  };
  ov[jobId] = {
    ...prev,
    ...patch,
    status: nextStatus,
    updatedAt: Date.now(),
  };
  cur.ov = ov;
  cur.ts = Date.now();
  await stateStore.setJSON(STATE_KEY, cur);

  // Also merge onto jobsdata when the job exists there.
  try {
    const jobsStore = getStore("jobsdata");
    const jobsDoc =
      (await jobsStore.get(JOBS_KEY, { type: "json", consistency: "strong" })) || { jobs: [] };
    const idx = (jobsDoc.jobs || []).findIndex((j) => String(j.id) === String(jobId));
    if (idx >= 0) {
      const j = jobsDoc.jobs[idx];
      jobsDoc.jobs[idx] = {
        ...j,
        ...patch,
        status: { ...(j.status || {}), ...(patch.status || {}) },
      };
      jobsDoc.ts = Date.now();
      await jobsStore.setJSON(JOBS_KEY, jobsDoc);
    }
  } catch (err) {
    console.error("[estimate-action] jobsdata merge failed", err);
  }
}

async function handleApprove(code, record) {
  const payload = record.payload || {};
  if (payload.approved) {
    return json({
      ok: true,
      action: "approve",
      already: true,
      message: "This estimate was already approved. Thank you!",
    });
  }
  payload.approved = true;
  payload.approvedAt = new Date().toISOString();
  record.payload = payload;
  await savePayRecord(code, record);

  const jobId = String(payload.j || "").trim();
  await patchJobEstimateAction(jobId, {
    estimateApprovedAt: payload.approvedAt,
    estimateApprovedBy: "customer",
    status: {
      Accepted: { s: "done", d: todayISO() },
      Estimate: { s: "done", d: todayISO() },
    },
  });

  return json({
    ok: true,
    action: "approve",
    message: "Thank you — your estimate is approved. We'll be in touch next.",
  });
}

async function handleDeposit(code, record, body) {
  const payload = record.payload || {};
  const depositPct = parseMoney(body.depositPct ?? payload.dp ?? 50) || 50;
  if (payload.depositDone && payload.depositInvoiceNo) {
    return json({
      ok: true,
      action: "deposit",
      already: true,
      invoiceNo: payload.depositInvoiceNo,
      payUrl: payload.depositPayUrl || "",
      amount: payload.depositAmount || 0,
      message: "A deposit invoice was already created for this estimate.",
    });
  }

  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (!lines.length) {
    return json(
      {
        ok: false,
        error: "no_lines",
        message: "This estimate link is missing line items. Please contact the office.",
      },
      400
    );
  }

  const estNo = String(payload.en || payload.i || "").trim();
  const invoiceNo = String(body.invoiceNo || depositInvoiceNo(estNo)).trim();
  const job = buildDepositJobFromPayload(payload, { depositPct, invoiceNo });
  const total = parseMoney(job.amount);

  // Prefer client-built PDF (qb-pdf). Required for local Resend path.
  const pdfB64 = String(body.pdfB64 || body.pdfBase64 || "").trim();
  if (!pdfB64) {
    return json(
      {
        ok: false,
        error: "pdf_required",
        message: "Could not build the deposit invoice PDF. Please try again or call the office.",
      },
      400
    );
  }

  // Mark estimate accepted + stamp invoice on job overlay.
  const jobId = String(payload.j || "").trim();
  await patchJobEstimateAction(jobId, {
    estimateApprovedAt: payload.approvedAt || new Date().toISOString(),
    estimateApprovedBy: payload.approved ? payload.estimateApprovedBy || "customer" : "customer",
    invoiceNo,
    invoiceLines: job.invoiceLines,
    amount: total,
    openBalance: total,
    estimateNo: estNo,
    invoiceProgressBilling: true,
    depositPct,
    status: {
      Estimate: { s: "done", d: todayISO() },
      Accepted: { s: "done", d: todayISO() },
      Invoiced: { s: "done", d: todayISO() },
    },
  });

  // Queue QBO create_invoice (host listener).
  await enqueueCommand({
    type: "create_invoice",
    jobId,
    payload: createInvoicePayloadFromJob(job, { progressPct: depositPct }),
    idempotencyKey: `est-deposit-create:${estNo}:${invoiceNo}`,
    lane: "deterministic",
  });

  // Email deposit invoice with payment landing link (same path as normal invoices).
  const emailResult = await sendDocEmail({
    job,
    kind: "invoice",
    to: job.email,
    includePaymentLink: true,
    pdfB64,
    filename: `Invoice_${invoiceNo}_Deposit.pdf`,
    message: `Thank you for approving estimate #${estNo}. This is your ${depositPct}% deposit invoice — pay online with the button below.`,
    subject: `Deposit Invoice #${invoiceNo} from BLZ Electric Inc.`,
    officeOnly: body.officeOnly === true || body.officeOnly === 1,
  });

  // Fallback: if email failed but we can still mint a pay link, return it.
  let payUrl = emailResult?.viewLink || "";
  if (!payUrl) {
    const cardknoxUrl = buildPayLink({
      amount: total,
      invoiceNumber: invoiceNo,
      customerName: job.customer,
      customerEmail: job.email,
    });
    const docData = {
      docNumber: invoiceNo,
      amountDue: total,
      billTo: { name: job.customer },
    };
    payUrl = await mintShortPayLink(
      buildEmailPayLandingPayload({ job, docData, email: job.email, cardknoxUrl, kind: "invoice" })
    );
  }

  payload.approved = true;
  payload.approvedAt = payload.approvedAt || new Date().toISOString();
  payload.depositDone = true;
  payload.depositInvoiceNo = invoiceNo;
  payload.depositAmount = total;
  payload.depositPct = depositPct;
  payload.depositPayUrl = payUrl;
  payload.depositAt = new Date().toISOString();
  record.payload = payload;
  record.invoiceNo = invoiceNo;
  await savePayRecord(code, record);

  const emailOk = !!(emailResult && emailResult.ok);
  return json({
    ok: true,
    action: "deposit",
    invoiceNo,
    amount: total,
    amountFormatted: money(total),
    depositPct,
    payUrl,
    emailSent: emailOk,
    email: emailResult || null,
    message: emailOk
      ? `Deposit invoice #${invoiceNo} (${money(total)}) was emailed with a payment link.`
      : `Deposit invoice #${invoiceNo} (${money(total)}) is ready. ${payUrl ? "Use the payment link below." : "Contact the office if you did not get an email."}`,
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

  const code = String(body.code || body.token || "").trim();
  const action = String(body.action || "").trim().toLowerCase();
  if (!code || !CODE_RE.test(code)) return json({ ok: false, error: "invalid code" }, 400);
  if (action !== "approve" && action !== "deposit") {
    return json({ ok: false, error: "bad action" }, 400);
  }

  const record = await loadPayRecord(code);
  if (!record?.payload) return json({ ok: false, error: "link not found" }, 404);

  const payload = record.payload;
  if (!isEstimatePayload(payload) && payload.k !== "e") {
    // Allow deposit only on estimate landings — never on invoice pay links.
    if (payload.k === "i" || payload.pay) {
      return json({ ok: false, error: "not_estimate" }, 400);
    }
  }
  // Soft accept: if k missing but en/lines present, treat as estimate.
  if (payload.k !== "e" && !(Array.isArray(payload.lines) && payload.lines.length)) {
    return json({ ok: false, error: "not_estimate" }, 400);
  }

  try {
    if (action === "approve") return await handleApprove(code, record);
    return await handleDeposit(code, record, body);
  } catch (err) {
    console.error("[estimate-action]", err);
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
};
