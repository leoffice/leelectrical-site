import { solaAmount } from "./payFees.js";

const DEFAULT_BASE = "https://secure.cardknox.com";
const DEFAULT_REDIRECT = "https://leelectrical.us/.netlify/functions/sola-payment";
const DEFAULT_POST_URL = DEFAULT_REDIRECT;
const DEFAULT_SLUG = "blzelectric";

/** Parse US-style addresses into Cardknox billing fields (incl. zip). */
export function parseUSAddress(raw) {
  const s = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return { street: "", city: "", state: "", zip: "" };

  let m = s.match(/^(.+?),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
  if (m) {
    return { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4] };
  }

  m = s.match(/^(.+?),\s*([^,]+),\s*([A-Za-z]{2}),?\s*(\d{5}(?:-\d{4})?)\s*$/);
  if (m) {
    return { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4] };
  }

  m = s.match(/^(.+?)\s+([A-Za-z][A-Za-z\s.'-]+)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
  if (m) {
    return { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4] };
  }

  m = s.match(/^(.+?),\s*([^,]+),\s*([A-Za-z]{2})\s*$/);
  if (m) {
    return { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: "" };
  }

  return { street: s, city: "", state: "", zip: "" };
}

export function siteSlugFromPayUrl(url) {
  try {
    const u = new URL(url);
    const slug = u.pathname.replace(/^\//, "").split("/")[0];
    return slug || DEFAULT_SLUG;
  } catch {
    return DEFAULT_SLUG;
  }
}

/** Build a Cardknox PaymentSITE URL with billing fields pre-filled. */
export function buildSolaPayUrl({
  slug = DEFAULT_SLUG,
  baseUrl = DEFAULT_BASE,
  amount,
  invoiceNo,
  customer = "",
  email = "",
  phone = "",
  address = "",
  billingAddress = "",
  zip = "",
  redirectUrl = DEFAULT_REDIRECT,
  postUrl = DEFAULT_POST_URL,
  principalAmount = "",
  jobId = "",
}) {
  const amt = solaAmount(amount);
  const inv = String(invoiceNo || "").trim();
  if (!slug || !amt || !inv) return "";

  const bill = parseUSAddress(billingAddress || address);
  const zipCode = String(zip || bill.zip || "").trim();
  const params = {
    xAmount: amt,
    xinvoice: inv,
    xRedirectURL: redirectUrl,
    xPostURL: postUrl,
  };
  const principal = solaAmount(principalAmount);
  if (principal) params.xCustom01 = principal;
  const jid = String(jobId || "").trim();
  if (jid) params.xCustom02 = jid;
  const name = String(customer || "").trim();
  if (name) params.xBillLastName = name;
  if (email) params.xEmail = String(email).trim();
  if (phone) params.xBillPhone = String(phone).trim();
  if (bill.street) params.xBillStreet = bill.street;
  if (bill.city) params.xBillCity = bill.city;
  if (bill.state) params.xBillState = bill.state;
  if (zipCode) params.xBillZip = zipCode;

  const qs = new URLSearchParams(params).toString();
  return `${String(baseUrl).replace(/\/$/, "")}/${slug}?${qs}`;
}

/** Resolve pay-site settings from a landing payload (new + legacy links). */
export function solaPayUrlFromLanding(data, chargeTotal, principalAmount) {
  if (!data) return "";
  const slug = data.sl || (data.pay ? siteSlugFromPayUrl(data.pay) : DEFAULT_SLUG);
  const principal = principalAmount ?? data.a;
  return buildSolaPayUrl({
    slug,
    amount: chargeTotal,
    principalAmount: principal,
    jobId: data.j,
    invoiceNo: data.i,
    customer: data.c,
    email: data.e,
    phone: data.ph,
    address: data.sa,
    billingAddress: data.ba || data.sa,
    zip: data.z,
  });
}