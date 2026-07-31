import { parseUSAddress } from "./solaPayUrl.js";
import { totalWithFee } from "./payFees.js";
import { functionsBase } from "./functionsBase.js";

export async function fetchSolaIfieldsConfig() {
  const res = await fetch(`${functionsBase()}/sola-ifields-config`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Could not load card processing config");
  }
  return data;
}

/** Live MM/YY formatting for the expiration text field (digits only, auto slash). */
export function formatCardExpInput(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + "/" + digits.slice(2);
}

/** MM/YY or MMYY → MMYY for Sola gateway. */
export function normalizeCardExp(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 4) return digits;
  if (digits.length === 6) return digits.slice(0, 4);
  return "";
}

export function billingFromJob(job) {
  const bill = parseUSAddress(job?.billingAddress || job?.address || "");
  return {
    name: job?.customer || job?.businessName || "",
    email: job?.email || "",
    phone: job?.phone || "",
    street: bill.street || "",
    city: bill.city || "",
    state: bill.state || "",
    zip: bill.zip || job?.zip || "",
  };
}

/** Billing fields from a public pay-landing payload (customer link). */
export function billingFromLanding(data) {
  const bill = parseUSAddress(data?.ba || data?.sa || "");
  return {
    name: data?.c || "",
    email: data?.e || "",
    phone: data?.ph || "",
    street: bill.street || "",
    city: bill.city || "",
    state: bill.state || "",
    zip: bill.zip || data?.z || "",
  };
}

export async function chargeCardInApp({
  job,
  principalAmount,
  includeFee = true,
  saveOnFile = false,
  xCardNum,
  xCVV,
  xExp,
  xToken,
}) {
  const invoiceNo = String(job?.invoiceNo || "").trim();
  if (!invoiceNo) throw new Error("Invoice # required to charge a card");

  const principal = parseFloat(String(principalAmount).replace(/[$,]/g, "")) || 0;
  if (principal <= 0) throw new Error("Enter a payment amount");

  const res = await fetch(`${functionsBase()}/sola-charge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      invoiceNo,
      jobId: job?.id || "",
      principalAmount: principal,
      includeFee,
      saveOnFile: Boolean(saveOnFile),
      xCardNum: xToken ? "" : xCardNum,
      xCVV: xToken ? "" : xCVV,
      xExp: xToken ? "" : normalizeCardExp(xExp),
      xToken: xToken || "",
      billing: billingFromJob(job),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Payment could not be processed");
  }
  return data;
}

/** Charge a card from the customer View & Pay page (no staff job object). */
export async function chargeCardFromLanding({
  data,
  principalAmount,
  includeFee = true,
  saveOnFile = false,
  xCardNum,
  xCVV,
  xExp,
}) {
  const invoiceNo = String(data?.i || "").trim();
  if (!invoiceNo) throw new Error("Invoice # required to pay");

  const principal = parseFloat(String(principalAmount).replace(/[$,]/g, "")) || 0;
  if (principal <= 0) throw new Error("Enter a payment amount");

  const res = await fetch(`${functionsBase()}/sola-charge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      invoiceNo,
      jobId: data?.j || "",
      principalAmount: principal,
      includeFee,
      saveOnFile: Boolean(saveOnFile),
      xCardNum,
      xCVV,
      xExp: normalizeCardExp(xExp),
      billing: billingFromLanding(data),
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) {
    throw new Error(out.error || "Payment could not be processed");
  }
  return out;
}

export function chargePreview(principal, includeFee = true) {
  const base = parseFloat(String(principal).replace(/[$,]/g, "")) || 0;
  if (!base) return { principal: 0, charge: 0 };
  return { principal: base, charge: totalWithFee(base, includeFee) };
}

/** Normalize routing (9 digits) / account (4–17 digits) for ACH process. */
export function normalizeAchRouting(raw) {
  return String(raw || "")
    .replace(/\D/g, "")
    .slice(0, 9);
}

export function normalizeAchAccount(raw) {
  return String(raw || "")
    .replace(/\D/g, "")
    .slice(0, 17);
}

export function validateAchBankFields({ routing, account, name } = {}) {
  const xRouting = normalizeAchRouting(routing);
  const xAccount = normalizeAchAccount(account);
  const xName = String(name || "").trim();
  if (xRouting.length !== 9) return { ok: false, error: "Routing number must be 9 digits" };
  if (xAccount.length < 4) return { ok: false, error: "Account number required" };
  if (!xName) return { ok: false, error: "Account holder name required" };
  return { ok: true, xRouting, xAccount, xName };
}

/**
 * Process ACH / check debit (Sola check:sale) from staff Mark-as-paid sheet.
 * Distinct from "Record only" which only writes the ledger without debiting.
 */
export async function chargeAchInApp({
  job,
  principalAmount,
  routing,
  account,
  name,
  checkNumber = "",
  accountType = "Checking",
  paymentMethod = "ACH",
  imageB64 = "",
}) {
  const invoiceNo = String(job?.invoiceNo || "").trim();
  if (!invoiceNo) throw new Error("Invoice # required to process ACH");

  const principal = parseFloat(String(principalAmount).replace(/[$,]/g, "")) || 0;
  if (principal <= 0) throw new Error("Enter a payment amount");

  const bank = validateAchBankFields({
    routing,
    account,
    name: name || job?.customer || job?.businessName || "",
  });
  if (!bank.ok) throw new Error(bank.error);

  const res = await fetch(`${functionsBase()}/sola-charge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      paymentMethod: paymentMethod === "Check" ? "check" : "ach",
      invoiceNo,
      jobId: job?.id || "",
      principalAmount: principal,
      includeFee: false,
      xRouting: bank.xRouting,
      xAccount: bank.xAccount,
      xName: bank.xName,
      xCheckNum: String(checkNumber || "").replace(/\D/g, ""),
      xAccountType: accountType,
      imageB64: imageB64 || "",
      billing: billingFromJob({ ...job, customer: bank.xName }),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "ACH payment could not be processed");
  }
  return data;
}

/** Process ACH / check deposit from the public pay page. */
export async function chargeAchFromLanding({
  data,
  principalAmount,
  routing,
  account,
  name,
  checkNumber = "",
  accountType = "Checking",
  paymentMethod = "Check",
  imageB64 = "",
}) {
  const invoiceNo = String(data?.i || "").trim();
  if (!invoiceNo) throw new Error("Invoice # required to pay");

  const principal = parseFloat(String(principalAmount).replace(/[$,]/g, "")) || 0;
  if (principal <= 0) throw new Error("Enter a payment amount");

  const bank = validateAchBankFields({
    routing,
    account,
    name: name || data?.c || "",
  });
  if (!bank.ok) throw new Error(bank.error);

  const res = await fetch(`${functionsBase()}/sola-charge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      paymentMethod: paymentMethod === "ACH" ? "ach" : "check",
      invoiceNo,
      jobId: data?.j || "",
      principalAmount: principal,
      includeFee: false,
      xRouting: bank.xRouting,
      xAccount: bank.xAccount,
      xName: bank.xName,
      xCheckNum: String(checkNumber || "").replace(/\D/g, ""),
      xAccountType: accountType,
      imageB64: imageB64 || "",
      billing: billingFromLanding({ ...data, c: bank.xName }),
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) {
    throw new Error(out.error || "Could not process bank payment");
  }
  return out;
}