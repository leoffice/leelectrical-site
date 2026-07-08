import { fmt$, todayStr } from "./format.js";
import { amountPaid, invoiceTotal, openBalance } from "./customers.js";

const SITE_ORIGIN =
  (typeof window !== "undefined" && window.location?.origin) || "https://leelectrical.us";

/** Compact payload embedded in the public View & Pay URL. */
export function buildPayLandingPayload({ job, cardknoxUrl, linkAmount, inv }) {
  const invoiceNo = inv || job?.invoiceNo || "";
  const total = invoiceTotal(job);
  const due = openBalance(job);
  const paid = amountPaid(job);
  const linkAmt = parseFloat(String(linkAmount).replace(/[$,]/g, "")) || due;
  return {
    i: invoiceNo,
    a: linkAmt,
    c: (job?.customer || "").trim(),
    w: (job?.title || job?.serviceType || "Electrical services").trim(),
    t: total > 0 ? fmt$(total) : job?.amount || "",
    d: due > 0 ? fmt$(due) : "",
    p: paid > 0 ? fmt$(paid) : "",
    pay: cardknoxUrl,
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
    let b64 = token.replace(/-/g, "+").replace(/_/g, "/");
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
  if (!o || !o.pay || !o.i) return null;
  return o;
}

/** Customer-facing URL — landing page before the Sola PaymentSITE form. */
export function buildPayLandingUrl({ job, cardknoxUrl, linkAmount, inv }) {
  const token = encodePayLanding(buildPayLandingPayload({ job, cardknoxUrl, linkAmount, inv }));
  return `${SITE_ORIGIN}/app/pro/#/pay/${token}`;
}