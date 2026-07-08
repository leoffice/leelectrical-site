import { getStore } from "@netlify/blobs";

// Cardknox / Sola PaymentSITE return handler.
//   GET  — customer redirect after pay (xRedirectURL)
//   POST — server webhook (xPostURL), if enabled in Sola portal
// On approval: enqueue record_payment (→ QuickBooks via command_listener) and
// mark the job paid in the shared overlay so LE Pro reflects it immediately.
const COMMANDS_KEY = "commands-v1";
const JOBS_KEY = "jobsdata-v1";
const STATE_KEY = "ov-v1";
const SITE = "https://leelectrical.us";
const THANKS = `${SITE}/app/pro/#/pay/thanks`;
const FEE_RATE = 0.035;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtAmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(2);
}

async function parsePayload(req) {
  const url = new URL(req.url);
  const out = Object.fromEntries(url.searchParams.entries());
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") || "";
    try {
      if (ct.includes("json")) {
        Object.assign(out, await req.json());
      } else {
        const fd = await req.formData();
        for (const [k, v] of fd.entries()) out[k] = String(v);
      }
    } catch {
      /* ignore malformed body */
    }
  }
  return out;
}

function approved(p) {
  const r = String(p.xResult || p.xresult || "").toUpperCase();
  const st = String(p.xStatus || "").toLowerCase();
  return r === "A" || r === "APPROVED" || st === "approved";
}

function principalAmount(p) {
  const custom = p.xCustom01 || p.xcustom01;
  if (custom) {
    const n = parseFloat(String(custom).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  const auth = parseFloat(String(p.xAuthAmount || p.xAmount || "").replace(/[^0-9.]/g, ""));
  if (Number.isFinite(auth) && auth > 0) {
    return Math.round((auth / (1 + FEE_RATE)) * 100) / 100;
  }
  return 0;
}

async function findJobId(invoiceNo, jobHint) {
  const hint = String(jobHint || "").trim();
  if (hint) return hint;
  const store = getStore("jobsdata");
  const doc = (await store.get(JOBS_KEY, { type: "json", consistency: "strong" })) || {};
  const inv = String(invoiceNo || "").trim();
  const job = (doc.jobs || []).find((j) => String(j.invoiceNo || "").trim() === inv);
  return job?.id || "";
}

async function enqueueRecordPayment({ jobId, invoiceNo, amount, ref, method }) {
  const store = getStore("commands");
  const doc =
    (await store.get(COMMANDS_KEY, { type: "json", consistency: "strong" })) ||
    { commands: [], seq: 0, ts: 0 };
  const idk = ref
    ? `sola-pay:${invoiceNo}:${ref}`
    : `sola-pay:${invoiceNo}:${amount}`;
  const existing = (doc.commands || []).find(
    (c) => c.idempotencyKey === idk && c.status !== "failed"
  );
  if (existing) return { deduped: true, command: existing };

  const now = Date.now();
  doc.seq = (doc.seq || 0) + 1;
  const command = {
    id: "c" + now + Math.random().toString(36).slice(2, 6),
    num: doc.seq,
    type: "record_payment",
    jobId: jobId || "",
    lane: "deterministic",
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    payload: {
      invoiceNo: String(invoiceNo),
      amount: fmtAmt(amount),
      method: method || "Card",
      ref: ref || "",
      date: todayISO(),
      note: "Sola online payment",
    },
    idempotencyKey: idk,
    createdAt: now,
    updatedAt: now,
    result: null,
    error: null,
    escalatedAt: 0,
    audit: [{ ts: now, status: "queued", note: "sola-payment" }],
  };
  doc.commands = doc.commands || [];
  doc.commands.push(command);
  doc.ts = now;
  await store.setJSON(COMMANDS_KEY, doc);
  return { deduped: false, command };
}

async function patchJobPaid(jobId, amount, ref, method) {
  if (!jobId) return;
  const store = getStore("jobstate");
  const cur =
    (await store.get(STATE_KEY, { type: "json", consistency: "strong" })) ||
    { ov: {}, ts: 0 };
  const ov = cur.ov || {};
  const prev = ov[jobId] || {};
  const n = Number(amount);
  const payAmt =
    "$" +
    (n % 1 ? n.toFixed(2) : String(Math.round(n)));
  ov[jobId] = Object.assign({}, prev, {
    paid: true,
    payment: Object.assign({}, prev.payment || {}, {
      amount: payAmt,
      method: method || "Card",
      ref: ref || "",
      date: todayISO(),
      recorded: false,
      source: "sola",
    }),
  });
  await store.setJSON(STATE_KEY, { ov, ts: Date.now() });
}

function thanksRedirect(params) {
  const q = new URLSearchParams(params);
  return Response.redirect(`${THANKS}?${q}`, 302);
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  const p = await parsePayload(req);
  const invoiceNo = String(p.xinvoice || p.xInvoice || "").trim();
  const ref = String(p.xRefNum || p.xrefnum || "").trim();
  const method = String(p.xCardType || p.xPaymentType || "Card").trim();
  const isWebhook = req.method === "POST";

  if (!approved(p)) {
    if (isWebhook) return new Response("DECLINED", { status: 200 });
    return thanksRedirect({
      ok: "0",
      inv: invoiceNo,
      msg: String(p.xError || p.xStatus || "Payment not approved").slice(0, 120),
    });
  }

  const amount = principalAmount(p);
  if (!invoiceNo || amount <= 0) {
    if (isWebhook) return new Response("BAD REQUEST", { status: 400 });
    return thanksRedirect({ ok: "0", inv: invoiceNo, msg: "Missing invoice or amount" });
  }

  const jobId = await findJobId(invoiceNo, p.xCustom02 || p.xcustom02);
  await enqueueRecordPayment({ jobId, invoiceNo, amount, ref, method });
  await patchJobPaid(jobId, amount, ref, method);

  if (isWebhook) return new Response("OK", { status: 200 });
  return thanksRedirect({
    ok: "1",
    inv: invoiceNo,
    amt: fmtAmt(amount),
    ref,
  });
};