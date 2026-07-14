import { fmt$, todayStr } from "./format.js";
import { amountPaid, invoiceTotal, openBalance } from "./customers.js";
import { normalizePayments } from "./payments.js";
import { parseAmount } from "./format.js";
import { parseUSAddress, extractZip } from "./solaPayUrl.js";
import { functionsBase, siteOrigin } from "./functionsBase.js";

const SHORT_CODE_RE = /^[0-9]{5,8}-[a-z0-9]{4}$/i;

/** Short customer link code (stored server-side) vs long embedded token. */
export function isShortPayCode(token) {
  return SHORT_CODE_RE.test(String(token || "").trim());
}

/** Compact payload embedded in the public View & Pay URL. */
export function buildPayLandingPayload({
  job,
  cardknoxUrl,
  linkAmount,
  inv,
  siteSlug = "blzelectric",
  includeFee = true,
}) {
  const invoiceNo = inv || job?.invoiceNo || "";
  const total = invoiceTotal(job);
  const due = openBalance(job);
  const pays = normalizePayments(job);
  const paid = amountPaid(job);
  const linkAmt = parseFloat(String(linkAmount).replace(/[$,]/g, "")) || due;
  const serviceAddr = (job?.serviceAddress || job?.address || "").trim();
  const billAddr = (job?.billingAddress || job?.address || serviceAddr).trim();
  const zip =
    String(job?.zip || "").trim() ||
    extractZip(billAddr) ||
    extractZip(serviceAddr) ||
    parseUSAddress(billAddr).zip ||
    parseUSAddress(serviceAddr).zip ||
    "";
  return {
    j: (job?.id || "").trim(),
    i: invoiceNo,
    a: linkAmt,
    fe: includeFee ? 1 : 0,
    c: (job?.customer || "").trim(),
    w: (job?.title || job?.serviceType || "Electrical services").trim(),
    t: total > 0 ? fmt$(total) : job?.amount || "",
    d: due > 0 ? fmt$(due) : "",
    p: paid > 0 ? fmt$(paid) : "",
    ps: pays.map((pay) => ({
      a: fmt$(parseAmount(pay.amount)),
      m: (pay.method || "").trim(),
      d: (pay.date || "").trim(),
      r: (pay.ref || "").trim(),
    })),
    e: (job?.email || "").trim(),
    ph: (job?.phone || "").trim(),
    sa: serviceAddr,
    ba: billAddr,
    z: zip,
    sl: siteSlug,
    pay: cardknoxUrl || "",
    as: todayStr(),
  };
}

function b64urlEncode(obj) {
  const raw = JSON.stringify(obj);
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(unescape(encodeURIComponent(raw)))
      : Buffer.from(raw, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(token) {
  if (!token) return null;
  try {
    let b64 = String(token).trim().replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const raw =
      typeof atob !== "undefined"
        ? decodeURIComponent(escape(atob(b64)))
        : Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function encodePayLanding(payload) {
  return b64urlEncode(payload);
}

export function decodePayLanding(token) {
  const o = b64urlDecode(token);
  if (!o || !o.i) return null;
  if (!o.sl && !o.pay) return null;
  return o;
}

/** Long URL with embedded token (legacy / fallback). */
export function buildPayLandingUrl({ job, cardknoxUrl, linkAmount, inv, siteSlug, includeFee = true }) {
  const token = encodePayLanding(
    buildPayLandingPayload({ job, cardknoxUrl, linkAmount, inv, siteSlug, includeFee })
  );
  return `${siteOrigin()}/app/pro/#/pay/${token}`;
}

/** Register payload server-side and return a short link like /pay/251825-x7k2. */
export async function registerShortPayLink(payload) {
  const res = await fetch(`${functionsBase()}/pay-link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok || !data.url) {
    throw new Error(data.error || "Could not create short payment link");
  }
  return data.url;
}

/** Preferred customer URL — short /pay/ link (falls back to long URL if register fails). */
export async function buildShortPayLandingUrl(opts) {
  const payload = buildPayLandingPayload(opts);
  try {
    return await registerShortPayLink(payload);
  } catch {
    return buildPayLandingUrl(opts);
  }
}

/** Resolve token from URL — decodes embedded token or fetches short code from server. */
export async function resolvePayLandingToken(token) {
  const t = String(token || "").trim();
  const decoded = decodePayLanding(t);
  if (decoded) return decoded;
  if (!isShortPayCode(t)) return null;
  const res = await fetch(`${functionsBase()}/pay-link?code=${encodeURIComponent(t)}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok || !data.payload) return null;
  return data.payload;
}

export function invoicePdfUrl(invoiceNo) {
  const no = String(invoiceNo || "").trim();
  if (!no) return "";
  return `${functionsBase()}/docs?key=inv-${encodeURIComponent(no)}`;
}

export function addressesDiffer(ba, sa) {
  const b = String(ba || "").trim().toLowerCase();
  const s = String(sa || "").trim().toLowerCase();
  return !!(b && s && b !== s);
}