import {
  applyApprovedSolaPayment,
  chargeFromPrincipal,
  fmtAmt,
  parseMoney,
} from "./sola-shared.mjs";

const GATEWAY = "https://x1.cardknox.com/gatewayjson";

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

function resolveXKey() {
  const env = String(process.env.SOLA_ENV || "production").trim().toLowerCase();
  const isDev = env === "dev" || env === "sandbox" || env === "test";
  return isDev
    ? process.env.SOLA_X_KEY_DEV || process.env.SOLA_X_KEY
    : process.env.SOLA_X_KEY;
}

function normExp(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 4) return digits;
  if (digits.length === 6) return digits.slice(0, 4);
  return "";
}

async function solaSale(body) {
  const xKey = resolveXKey();
  if (!xKey) {
    return { ok: false, error: "SOLA_X_KEY not configured on Netlify" };
  }
  const payload = {
    xKey,
    xVersion: "5.0.0",
    xSoftwareName: "LE Pro",
    xSoftwareVersion: "1.0.0",
    xCommand: "cc:sale",
    xAmount: body.xAmount,
    xCardNum: body.xCardNum,
    xCVV: body.xCVV || "",
    xExp: body.xExp,
    xInvoice: body.xInvoice,
    xCustom01: body.xCustom01 || "",
    xCustom02: body.xCustom02 || "",
  };
  const bill = body.billing || {};
  if (bill.name) payload.xBillLastName = bill.name;
  if (bill.email) payload.xEmail = bill.email;
  if (bill.phone) payload.xBillPhone = bill.phone;
  if (bill.street) payload.xBillStreet = bill.street;
  if (bill.city) payload.xBillCity = bill.city;
  if (bill.state) payload.xBillState = bill.state;
  if (bill.zip) payload.xBillZip = bill.zip;

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "Invalid response from payment gateway" };
  }
  return { ok: true, data };
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const invoiceNo = String(body.invoiceNo || "").trim();
  const jobId = String(body.jobId || "").trim();
  const principal = parseMoney(body.principalAmount ?? body.amount);
  const includeFee = body.includeFee !== false && body.includeFee !== 0;
  const chargeAmount = chargeFromPrincipal(principal, includeFee);
  const xCardNum = String(body.xCardNum || "").trim();
  const xCVV = String(body.xCVV || "").trim();
  const xExp = normExp(body.xExp);

  if (!invoiceNo) return json({ ok: false, error: "invoiceNo required" }, 400);
  if (principal <= 0) return json({ ok: false, error: "Enter a payment amount" }, 400);
  if (!xCardNum) return json({ ok: false, error: "Card number required" }, 400);
  if (!xExp || xExp.length !== 4) return json({ ok: false, error: "Expiration must be MMYY" }, 400);

  const sale = await solaSale({
    xAmount: fmtAmt(chargeAmount),
    xCardNum,
    xCVV,
    xExp,
    xInvoice: invoiceNo,
    xCustom01: fmtAmt(principal),
    xCustom02: jobId,
    billing: body.billing || {},
  });

  if (!sale.ok) return json({ ok: false, error: sale.error }, 503);

  const data = sale.data || {};
  const result = String(data.xResult || "").toUpperCase();

  if (result === "V") {
    return json({
      ok: false,
      error: "This card requires extra verification — use Payment link instead.",
      needs3ds: true,
      gateway: data,
    }, 402);
  }

  if (result !== "A" && result !== "APPROVED") {
    return json({
      ok: false,
      error: String(data.xError || data.xStatus || "Payment declined").slice(0, 200),
      gateway: data,
    }, 402);
  }

  const ref = String(data.xRefNum || "").trim();
  const method = String(data.xCardType || data.xPaymentType || "Credit card").trim();

  await applyApprovedSolaPayment({
    jobId,
    invoiceNo,
    amount: principal,
    ref,
    method,
    note: "LE Pro in-app card payment",
  });

  return json({
    ok: true,
    approved: true,
    amount: principal,
    chargeAmount,
    ref,
    method: method || "Credit card",
    cardType: data.xCardType || "",
    authCode: data.xAuthCode || "",
  });
};