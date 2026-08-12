import { getStore } from "./lib/storage/index.mjs";
import { loadLiveInvoiceJob, refreshedInvoicePayload } from "./lib/payLinkRefresh.mjs";

const SITE = "https://leelectrical.us";
const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const CODE_RE = /^[0-9]{5,8}-[a-z0-9]{4}$/i;

function corsHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

/** Always 4 chars so codes match CODE_RE (Math.random can yield shorter slices). */
export function randomSuffix(rand = Math.random) {
  return rand().toString(36).slice(2, 6).padEnd(4, "0").slice(0, 4);
}

export function makeCode(invoiceNo, rand = Math.random) {
  const inv = String(invoiceNo || "").trim().replace(/\D/g, "");
  // Always 5–8 digits so short codes still match CODE_RE / short-link resolver.
  let base = (inv || String(Date.now()).slice(-6)).slice(0, 8);
  if (base.length < 5) base = base.padStart(5, "0");
  return `${base}-${randomSuffix(rand)}`;
}

function invoiceDigitsFromCode(code) {
  const m = String(code || "").match(/^([0-9]{5,8})-[a-z0-9]{4}$/i);
  return m ? m[1] : "";
}

/**
 * Rebuild a missing short-link payload from the live job (CF/Netlify store
 * loss, or a memo that kept a code after storage rotated). Writes under the
 * same code so already-emailed URLs keep working. Same live-job source +
 * balance math as refresh-on-open, so healed links are current too (Levi
 * 2026-08-05: receipt emails still link here after pay-in-full — paid / $0
 * invoices heal to "Paid in full", never a dead link).
 */
export async function healMissingPayLink(store, code, hints = {}) {
  const invNo = invoiceDigitsFromCode(code);
  if (!invNo) return null;
  const job = await loadLiveInvoiceJob({ invoiceNo: invNo, jobId: hints.jobId || "" });
  if (!job) return null;

  // Minimal invoice stub — refreshedInvoicePayload fills everything live.
  // sl marks the payload as an invoice landing for the client decoder.
  const payload = refreshedInvoicePayload(
    { i: invNo, k: "i", e: job.email || "", sl: "blzelectric", fe: 1, pay: "" },
    job
  );
  if (!payload?.i) return null;

  const record = {
    payload,
    createdAt: Date.now(),
    invoiceNo: String(invNo),
    healed: true,
    healedAt: Date.now(),
  };
  try {
    await store.set(`pl-${code}`, JSON.stringify(record), {
      metadata: { invoiceNo: String(invNo), ts: Date.now(), healed: "1" },
    });
  } catch (err) {
    console.error("[pay-link] heal: store write failed", err);
    return null;
  }
  return record;
}

/**
 * Refresh-on-open: rebuild the stored payload from the live job before
 * resolving, so an emailed link always shows the CURRENT balance (a snapshot
 * showed the customer a stale $2,300 on invoice 251854, Levi 2026-08-12).
 * Persists the fresh payload under the same code. Falls back to the stored
 * snapshot when the job cannot be resolved (never blanks a working link).
 */
async function refreshRecord(store, code, record, jobIdHint = "") {
  const payload = record?.payload;
  if (!payload || typeof payload !== "object" || !payload.i) return record;
  if (payload.k === "e" || payload.kind === "estimate") return record;
  if (record.createdAt && Date.now() - record.createdAt > TTL_MS) return record;
  let fresh = null;
  try {
    const job = await loadLiveInvoiceJob({
      invoiceNo: String(payload.i).trim(),
      jobId: String(jobIdHint || payload.j || "").trim(),
      customer: String(payload.c || "").trim(),
    });
    fresh = refreshedInvoicePayload(payload, job);
  } catch (err) {
    console.error("[pay-link] refresh failed — serving stored snapshot", err);
  }
  if (!fresh) return record;
  const next = { ...record, payload: fresh, refreshedAt: Date.now() };
  if (JSON.stringify(fresh) !== JSON.stringify(payload)) {
    try {
      await store.set(`pl-${code}`, JSON.stringify(next), {
        metadata: { invoiceNo: String(payload.i), ts: Date.now(), refreshed: "1" },
      });
    } catch (err) {
      console.error("[pay-link] refresh: store write failed", err);
    }
  }
  return next;
}

function respondResolved(req, code, record) {
  if (record.createdAt && Date.now() - record.createdAt > TTL_MS) {
    return json({ ok: false, error: "link expired" }, 410);
  }
  // Browser hit from /pay/:code — send customer to the pay page.
  // IMPORTANT: do NOT put the route only in a URL hash on Location.
  // Many email clients / in-app browsers drop #fragments on 302, so the
  // customer lands on /app/pro/ (LockGate) → looks like a blank page.
  // Query ?pay= survives Location; main.jsx bootstraps #/pay/<code>.
  if (req.headers.get("accept")?.includes("text/html")) {
    const safe = encodeURIComponent(code);
    const target = `${SITE}/app/pro/?pay=${safe}`;
    const hashTarget = `${SITE}/app/pro/#/pay/${safe}`;
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Pay invoice</title>` +
        `<script>location.replace(${JSON.stringify(target)});</script></head>` +
        `<body><p><a href="${target}">Continue to invoice</a> · <a href="${hashTarget}">direct</a></p></body></html>`,
      { status: 302, headers: { Location: target, "content-type": "text/html; charset=utf-8" } }
    );
  }
  // Sanitize multi-email payloads stored before Cardknox E40 fix (one address only).
  const payload =
    record.payload && typeof record.payload === "object" ? { ...record.payload } : record.payload;
  if (payload && typeof payload.e === "string" && /[,;]/.test(payload.e)) {
    const one = String(payload.e)
      .split(/[,;]+/)
      .map((s) => s.trim())
      .find((s) => s.includes("@"));
    if (one) payload.e = one;
  }
  return json({ ok: true, code, payload, healed: !!record.healed });
}

export default async (req, env = {}) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  const store = getStore("paylinks");

  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    // Agent may stage pay-links only with payment management access + confirm.
    try {
      const { enforceAgentPaymentGate } = await import("./lib/agentPaymentGate.mjs");
      const denied = await enforceAgentPaymentGate(req, body, {
        op: "pay-link",
        amount: body.payload?.a ?? body.amount ?? null,
        ref: body.payload?.i || null,
        env,
      });
      if (denied) return json(denied.body, denied.status);
    } catch {
      const claim =
        req.headers?.get?.("x-le-agent-id") ||
        req.headers?.get?.("X-LE-Agent-Id") ||
        body?.agentId ||
        "";
      if (claim) {
        return json({ ok: false, error: "Could not verify agent payment access." }, 503);
      }
    }
    const payload = body.payload;
    if (!payload || !payload.i) return json({ ok: false, error: "payload with invoice required" }, 400);

    // Optional preferred code (heal / re-bind the URL already printed on a PDF).
    let code = String(body.code || "").trim();
    if (code) {
      if (!CODE_RE.test(code)) return json({ ok: false, error: "invalid code" }, 400);
      const digits = invoiceDigitsFromCode(code);
      const invDigits = String(payload.i || "").replace(/\D/g, "");
      // Code prefix must match the invoice DocNumber digits.
      if (digits !== invDigits) {
        return json({ ok: false, error: "code does not match invoice" }, 400);
      }
    } else {
      code = makeCode(payload.i);
    }

    const record = { payload, createdAt: Date.now(), invoiceNo: String(payload.i) };
    await store.set(`pl-${code}`, JSON.stringify(record), {
      metadata: { invoiceNo: String(payload.i), ts: Date.now() },
    });
    const url = `${SITE}/pay/${code}`;
    return json({ ok: true, code, url });
  }

  const url = new URL(req.url);
  let code = String(url.searchParams.get("code") || "").trim();
  if (!code) return json({ ok: false, error: "code required" }, 400);
  // Legacy long-token links refresh through here with a job-id hint so
  // duplicate invoice numbers never resolve to another customer's job.
  const jobIdHint = String(url.searchParams.get("j") || "").trim();
  // Browser hits redirect to the pay page, which immediately re-fetches this
  // endpoint as JSON — only the JSON resolve pays for the live-job refresh.
  const wantsHtml = !!req.headers.get("accept")?.includes("text/html");

  // Bare invoice digits (e.g. /pay/251854) — heal from jobsdata so View & Pay never blanks.
  // Stable code: <invoice>-view (matches CODE_RE).
  const bareInv = /^[0-9]{5,8}$/.test(code) ? code : "";
  if (bareInv) {
    const fixedCode = `${bareInv}-view`;
    let bareRaw = await store.get(`pl-${fixedCode}`, { type: "text" });
    let bareRecord = null;
    if (bareRaw) {
      try {
        bareRecord = JSON.parse(bareRaw);
      } catch {
        bareRecord = null;
      }
    }
    if (!bareRecord) {
      bareRecord = await healMissingPayLink(store, fixedCode, { jobId: jobIdHint });
    } else if (!wantsHtml) {
      bareRecord = await refreshRecord(store, fixedCode, bareRecord, jobIdHint);
    }
    if (!bareRecord) return json({ ok: false, error: "invoice not found" }, 404);
    return respondResolved(req, fixedCode, bareRecord);
  }

  if (!CODE_RE.test(code)) return json({ ok: false, error: "invalid code" }, 404);

  let raw = await store.get(`pl-${code}`, { type: "text" });
  let record = null;
  if (raw) {
    try {
      record = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "corrupt link data" }, 500);
    }
    if (!wantsHtml) {
      record = await refreshRecord(store, code, record, jobIdHint);
    }
  } else {
    // Self-heal: short code was emailed but missing from KV (migration / wipe).
    record = await healMissingPayLink(store, code, { jobId: jobIdHint });
    if (!record) return json({ ok: false, error: "link not found" }, 404);
  }

  return respondResolved(req, code, record);
};
