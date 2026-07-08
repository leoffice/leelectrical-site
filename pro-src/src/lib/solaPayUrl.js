import { solaAmount } from "./payFees.js";

const DEFAULT_BASE = "https://secure.cardknox.com";
const DEFAULT_REDIRECT = "https://leelectrical.us/app/pro/";
const DEFAULT_SLUG = "blzelectric";

/** Parse "123 Main, Brooklyn, NY 11225" into billing fields. */
export function parseUSAddress(raw) {
  const s = String(raw || "").trim();
  if (!s) return { street: "", city: "", state: "", zip: "" };
  const m = s.match(/^(.+?),\s*([^,]+),\s*([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?/);
  if (m) {
    return {
      street: m[1].trim(),
      city: m[2].trim(),
      state: m[3].toUpperCase(),
      zip: (m[4] || "").trim(),
    };
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
  redirectUrl = DEFAULT_REDIRECT,
}) {
  const amt = solaAmount(amount);
  const inv = String(invoiceNo || "").trim();
  if (!slug || !amt || !inv) return "";

  const bill = parseUSAddress(billingAddress || address);
  const params = {
    xAmount: amt,
    xinvoice: inv,
    xRedirectURL: redirectUrl,
  };
  const name = String(customer || "").trim();
  if (name) params.xBillLastName = name;
  if (email) params.xEmail = String(email).trim();
  if (phone) params.xBillPhone = String(phone).trim();
  if (bill.street) params.xBillStreet = bill.street;
  if (bill.city) params.xBillCity = bill.city;
  if (bill.state) params.xBillState = bill.state;
  if (bill.zip) params.xBillZip = bill.zip;

  const qs = new URLSearchParams(params).toString();
  return `${String(baseUrl).replace(/\/$/, "")}/${slug}?${qs}`;
}

/** Resolve pay-site settings from a landing payload (new + legacy links). */
export function solaPayUrlFromLanding(data, payAmount) {
  if (!data) return "";
  const slug = data.sl || (data.pay ? siteSlugFromPayUrl(data.pay) : DEFAULT_SLUG);
  return buildSolaPayUrl({
    slug,
    amount: payAmount,
    invoiceNo: data.i,
    customer: data.c,
    email: data.e,
    phone: data.ph,
    address: data.sa,
    billingAddress: data.ba || data.sa,
  });
}