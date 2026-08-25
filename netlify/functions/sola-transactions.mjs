/**
 * Staff-only Sola / Cardknox verification feed for LE Pro History.
 * Pulls report:transactions + report:batch so batches / approvals can be
 * cross-checked against payments recorded in the app.
 */
import { resolveXKey } from "./sola-keys.mjs";
import { authorizeSend } from "./lib/sendAuth.mjs";
import { PRODUCT_BRAND } from "../../shared/productBrand.mjs";
import { principalFromCharge, parseMoney } from "./sola-shared.mjs";

const REPORT = "https://x1.cardknox.com/reportjson";

function corsHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-le-email-key",
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Default window: last 14 days → Cardknox `yyyy-MM-dd HH:mm:ss`. */
function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
  const fmt = (d, endOfDay) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${
      endOfDay ? "23:59:59" : "00:00:00"
    }`;
  return { begin: fmt(start, false), end: fmt(end, true) };
}

function normalizeDateParam(raw, endOfDay) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return endOfDay ? `${s} 23:59:59` : `${s} 00:00:00`;
  }
  return "";
}

async function cardknoxReport(command, begin, end) {
  const xKey = resolveXKey();
  if (!xKey) return { ok: false, error: "SOLA_X_KEY not configured on Netlify" };
  const payload = {
    xKey,
    xVersion: "5.0.0",
    xSoftwareName: PRODUCT_BRAND.name,
    xSoftwareVersion: "1.0.0",
    xCommand: command,
    xBeginDate: begin,
    xEndDate: end,
  };
  const res = await fetch(REPORT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "Invalid report response from Sola" };
  }
  const status = String(data.xStatus || "");
  if (/error/i.test(status) || String(data.xResult || "").toUpperCase() === "E") {
    return {
      ok: false,
      error: String(data.xError || "Sola report failed").slice(0, 200),
      data,
    };
  }
  return { ok: true, data };
}

function normalizeTxn(row) {
  const charge = parseMoney(row.xAmount || row.xRequestAmount);
  const customPrincipal = parseMoney(row.xCustom01);
  const principal =
    customPrincipal || (charge ? principalFromCharge(charge, true) : 0);
  const result = String(row.xResponseResult || row.xStatus || "").trim();
  const approved = /^approved$/i.test(result) || String(row.xResult || "") === "A";
  return {
    ref: String(row.xRefNum || "").trim(),
    command: String(row.xCommand || "").trim(),
    result,
    approved,
    declined: /^declined$/i.test(result),
    voided: String(row.xVoid || "") === "1",
    chargeAmount: charge,
    principalAmount: principal,
    name: String(row.xName || "").trim(),
    maskedCard: String(row.xMaskedCardNumber || "").trim(),
    enteredAt: String(row.xEnteredDate || "").trim(),
    batch: String(row.xBatch || row.xResponseBatch || "").trim(),
    invoiceHint: String(row.xInvoice || "").trim(),
    jobId: String(row.xCustom02 || "").trim(),
    authCode: String(row.xResponseAuthCode || "").trim(),
  };
}

function normalizeBatch(row) {
  return {
    batch: String(row.xBatch || "").trim(),
    date: String(row.xBatchDate || "").trim(),
    time: String(row.xBatchTime || "").trim(),
    totalCount: Number(row.xTotalCount || 0) || 0,
    totalAmount: parseMoney(row.xTotalAmount),
    saleCount: Number(row.xSaleCount || 0) || 0,
    saleAmount: parseMoney(row.xSaleAmount),
    netTotalAmount: parseMoney(row.xNetTotalAmount),
  };
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true });
  }
  if (req.method !== "GET") {
    return json({ ok: false, error: "GET only" }, 405);
  }

  const auth = await authorizeSend(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error || "unauthenticated" }, auth.status || 401);
  }

  const url = new URL(req.url);
  const range = defaultRange();
  const begin =
    normalizeDateParam(url.searchParams.get("begin") || url.searchParams.get("from"), false) ||
    range.begin;
  const end =
    normalizeDateParam(url.searchParams.get("end") || url.searchParams.get("to"), true) ||
    range.end;

  const [txnRes, batchRes] = await Promise.all([
    cardknoxReport("report:transactions", begin, end),
    cardknoxReport("report:batch", begin, end),
  ]);

  if (!txnRes.ok) {
    return json({ ok: false, error: txnRes.error || "transaction report failed" }, 502);
  }

  const txnRows = Array.isArray(txnRes.data?.xReportData) ? txnRes.data.xReportData : [];
  const batchRows = batchRes.ok && Array.isArray(batchRes.data?.xReportData)
    ? batchRes.data.xReportData
    : [];

  const transactions = txnRows.map(normalizeTxn).filter((t) => t.ref);
  const batches = batchRows.map(normalizeBatch).filter((b) => b.batch);

  return json({
    ok: true,
    processor: "SOLA",
    begin,
    end,
    transactions,
    batches,
    counts: {
      transactions: transactions.length,
      approved: transactions.filter((t) => t.approved && !t.voided).length,
      declined: transactions.filter((t) => t.declined).length,
      batches: batches.length,
    },
  });
};
