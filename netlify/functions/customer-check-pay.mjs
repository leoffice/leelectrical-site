import { getStore } from "./lib/storage/index.mjs";
import { bytesFromBase64 } from "./lib/base64.mjs";

/**
 * Public pay page — customer submits a check photo for an invoice.
 * Stores the photo in docs, enqueues office review (record_payment after Levi confirms).
 *
 * POST {
 *   invoiceNo, jobId?, amount, checkNumber?, customer?, email?,
 *   imageB64, mime?, fileName?
 * }
 */
const COMMANDS_KEY = "commands-v1";
const INV_RE = /^\d{1,12}$/;

function corsHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtAmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(2);
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  const invoiceNo = String(body.invoiceNo || body.i || "").trim();
  if (!INV_RE.test(invoiceNo)) return json({ ok: false, error: "bad invoice number" }, 400);

  const amount = parseFloat(String(body.amount || "").replace(/[$,]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ ok: false, error: "amount required" }, 400);
  }

  const imageB64 = String(body.imageB64 || body.image || "").trim();
  if (!imageB64) return json({ ok: false, error: "check photo required" }, 400);
  if (imageB64.length > 12_000_000) return json({ ok: false, error: "image too large" }, 413);

  const jobId = String(body.jobId || body.j || "").trim();
  const checkNumber = String(body.checkNumber || body.ref || "")
    .replace(/\D/g, "")
    .trim();
  const customer = String(body.customer || body.c || "").trim();
  const email = String(body.email || body.e || "").trim();
  const mime = String(body.mime || "image/jpeg").trim() || "image/jpeg";
  const fileName = String(body.fileName || "check.jpg")
    .replace(/[^\w .-]/g, "_")
    .slice(0, 80);

  const proofKey = `chk-${invoiceNo}-${Date.now().toString(36)}`;
  let proofStored = false;
  try {
    const buf = bytesFromBase64(imageB64);
    if (buf.length > 0 && buf.length <= 9_000_000) {
      const docs = getStore("docs");
      await docs.set(proofKey, buf, {
        metadata: {
          mime,
          bytes: buf.length,
          ts: Date.now(),
          filename: fileName,
          invoiceNo,
        },
      });
      proofStored = true;
    }
  } catch (err) {
    console.error("[customer-check-pay] store proof failed", err);
  }

  const cmds = getStore("commands");
  const doc =
    (await cmds.get(COMMANDS_KEY, { type: "json", consistency: "strong" })) ||
    { commands: [], seq: 0, ts: 0 };

  const idk = `cust-check:${invoiceNo}:${fmtAmt(amount)}:${checkNumber || "n"}:${todayISO()}`;
  const existing = (doc.commands || []).find(
    (c) => c.idempotencyKey === idk && c.status !== "failed"
  );
  if (existing) {
    return json({
      ok: true,
      deduped: true,
      commandId: existing.id,
      proofKey: proofStored ? proofKey : "",
      message: "Check payment already received — our office will confirm.",
    });
  }

  const now = Date.now();
  doc.seq = (doc.seq || 0) + 1;
  const noteBits = [
    "Customer pay-page check photo",
    checkNumber ? `Check #${checkNumber}` : "",
    proofStored ? `proof:${proofKey}` : "proof not stored",
    customer ? `from ${customer}` : "",
  ].filter(Boolean);

  const command = {
    id: "c" + now + Math.random().toString(36).slice(2, 6),
    num: doc.seq,
    // Notify office first — host may record after Levi confirms deposit.
    type: "customer_check_payment",
    jobId: jobId || "",
    lane: "judgment",
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    payload: {
      invoiceNo,
      amount: fmtAmt(amount),
      method: "Check",
      ref: checkNumber,
      date: todayISO(),
      note: noteBits.join(" · "),
      email,
      customer,
      proofKey: proofStored ? proofKey : "",
      fileName,
      source: "pay_page",
      // Ready for record_payment once office confirms the deposit.
      recordReady: {
        invoiceNo,
        amount: fmtAmt(amount),
        method: "Check",
        ref: checkNumber,
        date: todayISO(),
        note: noteBits.join(" · "),
        email,
      },
    },
    idempotencyKey: idk,
    createdAt: now,
    updatedAt: now,
    result: null,
    error: null,
    escalatedAt: 0,
    audit: [{ ts: now, status: "queued", note: "customer-check-pay" }],
  };
  doc.commands = doc.commands || [];
  doc.commands.push(command);
  doc.ts = now;
  await cmds.setJSON(COMMANDS_KEY, doc);

  return json({
    ok: true,
    commandId: command.id,
    proofKey: proofStored ? proofKey : "",
    message: "Check received — our office will mark the invoice paid after deposit.",
  });
};
