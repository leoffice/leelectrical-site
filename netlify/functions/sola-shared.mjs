import { getStore } from "@netlify/blobs";

export const COMMANDS_KEY = "commands-v1";
export const JOBS_KEY = "jobsdata-v1";
export const STATE_KEY = "ov-v1";
export const FEE_RATE = 0.035;

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function fmtAmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(2);
}

export function parseMoney(raw) {
  const n = parseFloat(String(raw || "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function fmtMoney(n) {
  return n % 1 ? "$" + n.toFixed(2) : "$" + Math.round(n);
}

export function normalizeCardMethod(raw) {
  const s = String(raw || "").trim();
  if (!s || /^card$/i.test(s)) return "Credit card";
  if (/^visa$|^mastercard$|^mc$|^amex$|^discover$/i.test(s)) return "Credit card";
  return s;
}

export function principalFromCharge(chargeAmount, includeFee = true) {
  const charge = parseMoney(chargeAmount);
  if (!charge) return 0;
  if (!includeFee) return charge;
  return Math.round((charge / (1 + FEE_RATE)) * 100) / 100;
}

export function chargeFromPrincipal(principal, includeFee = true) {
  const base = parseMoney(principal);
  if (!base) return 0;
  if (!includeFee) return base;
  return Math.round(base * (1 + FEE_RATE) * 100) / 100;
}

function normalizePayments(job) {
  const list = Array.isArray(job?.payments) ? job.payments.map((p) => ({ ...p })) : [];
  const legacy = job?.payment;
  if (legacy && (legacy.amount || legacy.method || legacy.ref)) {
    const lid = legacy.id || "legacy-" + (legacy.date || legacy.ref || "0");
    if (!list.some((p) => p.id === lid)) list.push({ ...legacy, id: lid });
  }
  return list.filter((p) => parseMoney(p.amount) > 0 || p.method || p.ref);
}

function owedAtStart(job, payments) {
  if (job?.paymentBaseline != null && job.paymentBaseline !== "") return parseMoney(job.paymentBaseline);
  const paidSum = payments.reduce((s, p) => s + parseMoney(p.amount), 0);
  const curOpen = job?.openBalance != null && job.openBalance !== "" ? parseMoney(job.openBalance) : null;
  if (curOpen != null && paidSum > 0) return curOpen + paidSum;
  const hay = [job?.notes, job?.followUp?.text].filter(Boolean).join(" ");
  const m = hay.match(/(?:open\s*balance|balance\s*due|balance|owes?|remaining)\D{0,8}\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (m) return parseMoney(m[1]);
  return parseMoney(job?.amount) || parseMoney(job?.openBalance);
}

export async function findJobId(invoiceNo, jobHint) {
  const hint = String(jobHint || "").trim();
  if (hint) return hint;
  const store = getStore("jobsdata");
  const doc = (await store.get(JOBS_KEY, { type: "json", consistency: "strong" })) || {};
  const inv = String(invoiceNo || "").trim();
  const job = (doc.jobs || []).find((j) => String(j.invoiceNo || "").trim() === inv);
  return job?.id || "";
}

export async function enqueueRecordPayment({ jobId, invoiceNo, amount, ref, method, note }) {
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
      method: normalizeCardMethod(method),
      ref: ref || "",
      date: todayISO(),
      note: note || "Sola card payment",
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

export async function patchJobPayment(jobId, amount, ref, method) {
  if (!jobId) return;
  const jobsStore = getStore("jobsdata");
  const stateStore = getStore("jobstate");
  const jobsDoc =
    (await jobsStore.get(JOBS_KEY, { type: "json", consistency: "strong" })) || { jobs: [] };
  const baseJob = (jobsDoc.jobs || []).find((j) => String(j.id) === String(jobId)) || {};
  const cur =
    (await stateStore.get(STATE_KEY, { type: "json", consistency: "strong" })) ||
    { ov: {}, ts: 0 };
  const ov = cur.ov || {};
  const prev = ov[jobId] || {};
  const merged = { ...baseJob, ...prev };
  const payId = ref ? "sola-" + ref : "sola-" + Date.now();
  const existing = normalizePayments(merged);
  if (existing.some((p) => p.id === payId)) return;

  const entry = {
    id: payId,
    amount: fmtMoney(amount),
    method: normalizeCardMethod(method),
    ref: ref || "",
    date: todayISO(),
    recorded: false,
    source: "sola",
  };
  const list = [...existing, entry];
  const owed = owedAtStart(merged, list);
  const paidSum = list.reduce((s, p) => s + parseMoney(p.amount), 0);
  const remaining = Math.max(0, owed - paidSum);
  const fullPay = remaining <= 0.01;
  const latest = list.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))).pop();

  ov[jobId] = {
    ...prev,
    payments: list,
    paymentBaseline: prev.paymentBaseline != null ? prev.paymentBaseline : owed,
    openBalance: fullPay ? 0 : remaining,
    paid: fullPay,
    payment: latest || null,
    status: fullPay
      ? { Paid: { s: "done", d: entry.date }, "Follow-up": { s: "done", d: entry.date } }
      : { Paid: { s: "" }, "Follow-up": { s: "" } },
  };
  await stateStore.setJSON(STATE_KEY, { ov, ts: Date.now() });
}

/** Apply an approved Sola payment to commands + job overlay. */
export async function applyApprovedSolaPayment({ jobId, invoiceNo, amount, ref, method, note }) {
  const jid = jobId || (await findJobId(invoiceNo, jobId));
  await enqueueRecordPayment({ jobId: jid, invoiceNo, amount, ref, method, note });
  await patchJobPayment(jid, amount, ref, method);
  return jid;
}