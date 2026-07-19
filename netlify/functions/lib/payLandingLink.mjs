// Short "View Invoice" landing links for outbound email.
//
// The email must never print a raw Cardknox URL as body text (it leaked
// xBillLastName/xEmail query params and wrapped horribly on a phone). Instead
// we register the landing payload server-side and hand the customer a short
// https://leelectrical.us/pay/<code> link behind a single button.
//
// That code resolves through pay-link.mjs to the PayLanding page, which shows
// invoice details + payment history + the full PDF + a Pay option — so the
// email needs exactly one CTA and paying happens on the page.
//
// Key/format/TTL deliberately mirror pay-link.mjs so either can mint or read.

import { getStore } from "./storage/index.mjs";

const SITE = "https://leelectrical.us";
const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days — matches pay-link.mjs

/** Same shape pay-link.mjs mints and PayLanding accepts: 5-8 digits + "-" + 4. */
export function makePayCode(invoiceNo, rand = Math.random) {
  const inv = String(invoiceNo || "").trim().replace(/\D/g, "");
  const base = (inv || String(Date.now()).slice(-6)).slice(0, 8);
  const suffix = rand().toString(36).slice(2, 6).padEnd(4, "0").slice(0, 4);
  return `${base}-${suffix}`;
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function amt(raw) {
  const n = parseFloat(String(raw ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Payment history for the landing page (newest first). */
function paymentsFor(job) {
  const list = Array.isArray(job?.payments) ? job.payments : [];
  return list
    .filter((p) => p && (amt(p.amount) > 0 || p.method || p.ref))
    .map((p) => ({
      a: money(amt(p.amount)),
      m: String(p.method || "").trim(),
      d: String(p.date || "").trim(),
      r: String(p.ref || "").trim(),
    }))
    .sort((a, b) => String(b.d).localeCompare(String(a.d)));
}

/**
 * Landing payload for an emailed invoice. Mirrors the client's
 * buildPayLandingPayload contract (pro-src/src/lib/payLanding.js).
 */
export function buildEmailPayLandingPayload({ job = {}, docData = {}, email = "", cardknoxUrl = "" }) {
  const serviceAddr = String(job.serviceAddress || job.address || "").trim();
  const billAddr = String(job.billingAddress || job.address || serviceAddr).trim();
  const due = amt(docData.amountDue);
  const paid = (Array.isArray(job.payments) ? job.payments : []).reduce((s, p) => s + amt(p?.amount), 0);
  return {
    j: String(job.id || "").trim(),
    i: String(docData.docNumber || job.invoiceNo || "").trim(),
    a: due,
    fe: 1,
    c: String(docData.billTo?.name || job.customer || "").trim(),
    w: String(job.title || job.serviceType || "Electrical services").trim(),
    t: money(due + paid),
    d: money(due),
    p: money(paid),
    ps: paymentsFor(job),
    e: String(email || job.email || "").trim(),
    ph: String(job.phone || "").trim(),
    sa: serviceAddr,
    ba: billAddr,
    z: String(job.zip || "").trim(),
    sl: "blzelectric",
    pay: String(cardknoxUrl || ""),
    as: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Register the payload and return the short customer-facing URL.
 * Returns "" if the store is unavailable — the caller then omits the button
 * rather than falling back to a raw URL.
 */
export async function mintShortPayLink(payload) {
  if (!payload || !payload.i) return "";
  try {
    const store = getStore("paylinks");
    const code = makePayCode(payload.i);
    await store.set(
      `pl-${code}`,
      JSON.stringify({ payload, createdAt: Date.now(), invoiceNo: String(payload.i) }),
      { metadata: { invoiceNo: String(payload.i), ts: Date.now(), ttl: TTL_MS } }
    );
    return `${SITE}/pay/${code}`;
  } catch (err) {
    console.error("[pay-landing-link] mint failed", err);
    return "";
  }
}
