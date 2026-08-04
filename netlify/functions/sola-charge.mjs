import {
  applyApprovedSolaPayment,
  chargeFromPrincipal,
  fmtAmt,
  parseMoney,
  todayISO,
} from "./sola-shared.mjs";
import { sendPaymentConfirmEmail } from "./payment-confirm-email.mjs";
import { resolveXKey, sutMismatchHint } from "./sola-keys.mjs";
import { PRODUCT_BRAND } from "../../shared/productBrand.mjs";

const GATEWAY = "https://x1.cardknox.com/gatewayjson";

function corsHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

function normExp(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 4) return digits;
  if (digits.length === 6) return digits.slice(0, 4);
  return "";
}

async function solaSave(body) {
  const xKey = resolveXKey();
  if (!xKey) return { ok: false, error: "SOLA_X_KEY not configured on Netlify" };
  const payload = {
    xKey,
    xVersion: "5.0.0",
    xSoftwareName: PRODUCT_BRAND.name,
    xSoftwareVersion: "1.0.0",
    xCommand: "cc:save",
    xCardNum: body.xCardNum,
    xCVV: body.xCVV || "",
    xExp: body.xExp,
    xInvoice: body.xInvoice || "",
  };
  const bill = body.billing || {};
  if (bill.name) payload.xBillLastName = bill.name;
  if (bill.email) payload.xEmail = bill.email;
  if (bill.street) payload.xBillStreet = bill.street;
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
    return { ok: false, error: "Invalid save response from gateway" };
  }
  return { ok: true, data };
}

async function solaSale(body) {
  const xKey = resolveXKey();
  if (!xKey) {
    return { ok: false, error: "SOLA_X_KEY not configured on Netlify" };
  }
  const payload = {
    xKey,
    xVersion: "5.0.0",
    xSoftwareName: PRODUCT_BRAND.name,
    xSoftwareVersion: "1.0.0",
    xCommand: "cc:sale",
    xAmount: body.xAmount,
    xCVV: body.xCVV || "",
    xExp: body.xExp || "",
    xInvoice: body.xInvoice,
    xCustom01: body.xCustom01 || "",
    xCustom02: body.xCustom02 || "",
  };
  if (body.xToken) payload.xToken = body.xToken;
  else payload.xCardNum = body.xCardNum;
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

function achEnabledEnv() {
  const v = String(process.env.SOLA_ACH_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** ACH / check debit via Sola check:sale (routing + account). */
async function solaCheckSale(body) {
  const xKey = resolveXKey();
  if (!xKey) {
    return { ok: false, error: "SOLA_X_KEY not configured on Netlify" };
  }
  const payload = {
    xKey,
    xVersion: "5.0.0",
    xSoftwareName: PRODUCT_BRAND.name,
    xSoftwareVersion: "1.0.0",
    xCommand: "check:sale",
    xAmount: body.xAmount,
    xRouting: body.xRouting,
    xAccount: body.xAccount,
    xName: body.xName,
    xInvoice: body.xInvoice || "",
    xCustom01: body.xCustom01 || "",
    xCustom02: body.xCustom02 || "",
    xAccountType: body.xAccountType || "Checking",
    xPaymentOrigin: body.xPaymentOrigin || "Internet",
  };
  if (body.xCheckNum) payload.xCheckNum = body.xCheckNum;
  if (body.xCheckImageFront) payload.xCheckImageFront = body.xCheckImageFront;
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

function isAchBody(body) {
  const m = String(body.paymentMethod || body.method || body.payType || "")
    .trim()
    .toLowerCase();
  if (m === "ach" || m === "check" || m === "echeck" || m === "bank") return true;
  if (body.xRouting || body.routingNumber || body.routing) return true;
  return false;
}

export default async (req, env = {}) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  // Agent fleet identity: payments toggle + per-action confirm required.
  // Human/owner (no fleet headers) unchanged. Processor secret never leaves server.
  try {
    const { enforceAgentPaymentGate } = await import("./lib/agentPaymentGate.mjs");
    const denied = await enforceAgentPaymentGate(req, body, {
      op: "sola-charge",
      amount: body.principalAmount ?? body.amount,
      ref: body.invoiceNo || body.jobId || null,
      env,
    });
    if (denied) return json(denied.body, denied.status);
  } catch {
    const claim =
      req.headers?.get?.("x-le-agent-id") ||
      req.headers?.get?.("X-LE-Agent-Id") ||
      body?.agentId ||
      body?.agentToken ||
      "";
    if (claim) {
      return json({ ok: false, error: "Could not verify agent payment access." }, 503);
    }
  }

  const invoiceNo = String(body.invoiceNo || "").trim();
  const jobId = String(body.jobId || "").trim();
  const principal = parseMoney(body.principalAmount ?? body.amount);
  const wantAch = isAchBody(body);
  // ACH never adds the card processing fee unless explicitly requested.
  const includeFee = wantAch
    ? body.includeFee === true || body.includeFee === 1
    : body.includeFee !== false && body.includeFee !== 0;
  const chargeAmount = chargeFromPrincipal(principal, includeFee);
  const saveOnFile = Boolean(body.saveOnFile);
  const xToken = String(body.xToken || "").trim();
  const xCardNum = String(body.xCardNum || "").trim();
  const xCVV = String(body.xCVV || "").trim();
  const xExp = normExp(body.xExp);

  if (!invoiceNo) return json({ ok: false, error: "invoiceNo required" }, 400);
  if (principal <= 0) return json({ ok: false, error: "Enter a payment amount" }, 400);

  // ——— ACH / check process path (debit bank account) ———
  if (wantAch) {
    if (!achEnabledEnv()) {
      return json(
        {
          ok: false,
          error:
            "ACH processing is not enabled yet — set SOLA_ACH_ENABLED=true on the host, or use Record only.",
        },
        503
      );
    }
    const xRouting = String(body.xRouting || body.routingNumber || body.routing || "")
      .replace(/\D/g, "")
      .trim();
    const xAccount = String(body.xAccount || body.accountNumber || body.account || "")
      .replace(/\D/g, "")
      .trim();
    const xName = String(
      body.xName || body.accountName || body.achName || body.billing?.name || ""
    ).trim();
    const xCheckNum = String(body.xCheckNum || body.checkNumber || body.ref || "")
      .replace(/\D/g, "")
      .trim();
    const xAccountType = /sav/i.test(String(body.xAccountType || body.accountType || ""))
      ? "Savings"
      : "Checking";
    const checkImageFront = String(body.xCheckImageFront || body.checkImageFront || body.imageB64 || "")
      .replace(/^data:[^;]+;base64,/i, "")
      .replace(/\s+/g, "")
      .trim();

    if (xRouting.length !== 9) {
      return json({ ok: false, error: "Routing number must be 9 digits" }, 400);
    }
    // ABA routing checksum (reject transposed MICR before gateway)
    {
      const d = xRouting.split("").map((c) => c.charCodeAt(0) - 48);
      const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
      if (sum % 10 !== 0) {
        return json(
          { ok: false, error: "Routing number failed bank checksum — re-check the MICR line" },
          400
        );
      }
    }
    if (xAccount.length < 4) {
      return json({ ok: false, error: "Account number required" }, 400);
    }
    if (!xName) {
      return json({ ok: false, error: "Account holder name required" }, 400);
    }

    const sale = await solaCheckSale({
      xAmount: fmtAmt(chargeAmount),
      xRouting,
      xAccount,
      xName,
      xCheckNum,
      xAccountType,
      xInvoice: invoiceNo,
      xCustom01: fmtAmt(principal),
      xCustom02: jobId,
      xCheckImageFront: checkImageFront || undefined,
      xPaymentOrigin: body.xPaymentOrigin || "Internet",
      billing: body.billing || { name: xName },
    });

    if (!sale.ok) return json({ ok: false, error: sale.error }, 503);

    const data = sale.data || {};
    const result = String(data.xResult || "").toUpperCase();
    if (result !== "A" && result !== "APPROVED") {
      const base = String(data.xError || data.xStatus || "ACH payment declined").slice(0, 200);
      return json({ ok: false, error: base, gateway: data }, 402);
    }

    const ref = String(data.xRefNum || "").trim();
    const methodLabel =
      String(body.paymentMethod || body.method || "").toLowerCase() === "check" ? "Check" : "ACH";
    const appliedJobId = await applyApprovedSolaPayment({
      jobId,
      invoiceNo,
      amount: principal,
      ref,
      method: methodLabel,
      note: `${PRODUCT_BRAND.name} in-app ${methodLabel} process · acct …${xAccount.slice(-4)}`,
      cardToken: "",
      cardMasked: "",
    });

    await sendPaymentConfirmEmail({
      jobId: appliedJobId || jobId,
      invoiceNo,
      amount: principal,
      ref,
      payDate: todayISO(),
    });

    return json({
      ok: true,
      approved: true,
      amount: principal,
      chargeAmount,
      ref,
      method: methodLabel,
      authCode: data.xAuthCode || "",
      paymentType: "ach",
      accountLast4: xAccount.slice(-4),
    });
  }

  // ——— Card path ———
  if (!xToken && !xCardNum) return json({ ok: false, error: "Card number required" }, 400);
  if (!xToken && (!xExp || xExp.length !== 4)) return json({ ok: false, error: "Expiration must be MMYY" }, 400);

  const sale = await solaSale({
    xAmount: fmtAmt(chargeAmount),
    xCardNum: xToken ? "" : xCardNum,
    xCVV: xToken ? "" : xCVV,
    xExp: xToken ? "" : xExp,
    xToken,
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
    const base = String(data.xError || data.xStatus || "Payment declined").slice(0, 200);
    const hint = sutMismatchHint(base);
    return json({
      ok: false,
      error: (base + hint).slice(0, 280),
      gateway: data,
    }, 402);
  }

  const ref = String(data.xRefNum || "").trim();
  const method = String(data.xCardType || data.xPaymentType || "Credit card").trim();
  let cardToken = String(data.xToken || "").trim();
  let cardMasked = String(data.xMaskedCardNumber || "").trim();

  if (saveOnFile && !cardToken && xCardNum && xExp) {
    const saved = await solaSave({
      xCardNum,
      xCVV,
      xExp,
      xInvoice: invoiceNo,
      billing: body.billing || {},
    });
    if (saved.ok) {
      const sd = saved.data || {};
      if (String(sd.xResult || "").toUpperCase() === "A" || String(sd.xStatus || "").toLowerCase() === "approved") {
        cardToken = String(sd.xToken || "").trim() || cardToken;
        cardMasked = String(sd.xMaskedCardNumber || "").trim() || cardMasked;
      }
    }
  }

  const appliedJobId = await applyApprovedSolaPayment({
    jobId,
    invoiceNo,
    amount: principal,
    ref,
    method,
    // Written into the payment ledger — external stored data. A rename affects
    // only NEW records; readers must tolerate both wordings.
    note: `${PRODUCT_BRAND.name} in-app card payment`,
    cardToken: saveOnFile ? cardToken : "",
    cardMasked: saveOnFile ? cardMasked : "",
  });

  await sendPaymentConfirmEmail({
    jobId: appliedJobId || jobId,
    invoiceNo,
    amount: principal,
    ref,
    payDate: todayISO(),
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
    cardToken: saveOnFile ? cardToken : "",
    cardMasked: saveOnFile ? cardMasked : "",
  });
};