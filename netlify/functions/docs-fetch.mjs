import { getStore } from "./lib/storage/index.mjs";

// Public pay page — request a missing invoice PDF from QuickBooks.
// Enqueues fetch_pdf for command_listener (same pipeline as LE Pro View PDF).
// POST { invoiceNo, jobId? }  or  GET ?invoice=<no>&jobId=<id>
const COMMANDS_KEY = "commands-v1";
const INV_RE = /^\d{1,12}$/;

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function enqueueFetchPdf(invoiceNo, jobId = "") {
  const no = String(invoiceNo || "").trim();
  const store = getStore("commands");
  const doc =
    (await store.get(COMMANDS_KEY, { type: "json", consistency: "strong" })) ||
    { commands: [], seq: 0, ts: 0 };
  const idk = `pdf:pay:${no}:${todayISO()}`;
  const existing = (doc.commands || []).find(
    (c) => c.idempotencyKey === idk && c.status !== "failed"
  );
  if (existing) return { deduped: true, command: existing };

  const now = Date.now();
  doc.seq = (doc.seq || 0) + 1;
  const command = {
    id: "c" + now + Math.random().toString(36).slice(2, 6),
    num: doc.seq,
    type: "fetch_pdf",
    jobId: String(jobId || "").trim(),
    lane: "judgment",
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    payload: { kind: "invoice", no, docKey: "inv-" + no },
    idempotencyKey: idk,
    createdAt: now,
    updatedAt: now,
    result: null,
    error: null,
    escalatedAt: 0,
    audit: [{ ts: now, status: "queued", note: "pay-page view invoice" }],
  };
  doc.commands = doc.commands || [];
  doc.commands.push(command);
  doc.ts = now;
  await store.setJSON(COMMANDS_KEY, doc);
  return { deduped: false, command };
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  let invoiceNo = "";
  let jobId = "";
  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      /* ignore */
    }
    invoiceNo = body.invoiceNo || body.no || "";
    jobId = body.jobId || body.j || "";
  } else if (req.method === "GET") {
    const url = new URL(req.url);
    invoiceNo = url.searchParams.get("invoice") || url.searchParams.get("no") || "";
    jobId = url.searchParams.get("jobId") || url.searchParams.get("j") || "";
  } else {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const no = String(invoiceNo || "").trim();
  if (!INV_RE.test(no)) return json({ ok: false, error: "bad invoice number" }, 400);

  const result = await enqueueFetchPdf(no, jobId);
  return json({ ok: true, queued: true, deduped: result.deduped, invoiceNo: no });
};