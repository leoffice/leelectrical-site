// Parse calendar appointment description + location into job/customer prefill.
import { cloneJobAtAddressPatch } from "./customerHierarchy.js";
import { serviceAddressKey } from "./customerHierarchy.js";
import { evStart } from "./format.js";

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/i;
const PHONE_LABELED_RE = /(?:phone|tel|cell|mobile|call)[:\s]+([+\d()\-.\s]{7,20})/i;
const PHONE_LOOSE_RE =
  /(?:^|[\s,(])(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/;
const CUSTOMER_RE =
  /\bcustomer\s+([A-Za-z][A-Za-z .,'&-]{1,40}?(?=\s+(?:apt|apartment|unit|suite|phone|tel|cell|email|rear|call|bill|contact|on|\d)|$|[,.]))/i;
const CONTACT_RE =
  /\bcontact\s*:?\s*([A-Za-z][A-Za-z .,'-]{1,40}?(?=\s+(?:phone|tel|cell|email|apt|on|\d)|$|[,.]))/i;
const BILL_TO_RE =
  /\bbill(?:ing)?\s*(?:to|at)?\s*:?\s*([^\n]+)/i;
const APT_RE = /\b(?:apt\.?|apartment|unit|suite|#)\s*#?\s*([A-Za-z0-9][A-Za-z0-9-]{0,8})\b/i;
const SAYS_APT_RE = /\b(?:it\s+)?says?\s+([A-Za-z]?\d+[A-Za-z]?)\b/i;
const APT_IS_RE = /\b(?:apt|apartment|unit)\s+is\s+([A-Za-z0-9][A-Za-z0-9-]{0,8})\b/i;
const LINE_UNIT_RE = /^([A-Za-z]?\d{1,3}[A-Za-z]?)$/;

function looksLikeUnit(token) {
  const t = String(token || "").trim();
  if (!t || t.length > 6) return false;
  if (/^\d{4,}$/.test(t)) return false;
  return /^[A-Za-z]?\d{1,3}[A-Za-z]?$/.test(t);
}

function extractApartment(desc, location) {
  const text = String(desc || "");
  const labeled = text.match(APT_RE);
  if (labeled) return labeled[1].trim();

  const says = text.match(SAYS_APT_RE);
  if (says && looksLikeUnit(says[1])) return says[1].trim();

  const aptIs = text.match(APT_IS_RE);
  if (aptIs) return aptIs[1].trim();

  for (const line of text.split(/\n+/)) {
    const t = line.trim().replace(/[,.;]+$/, "");
    if (LINE_UNIT_RE.test(t) && looksLikeUnit(t)) return t;
    const unitLine = t.match(/\bunit\s*:?\s*([A-Za-z0-9][A-Za-z0-9-]{0,8})\b/i);
    if (unitLine) return unitLine[1].trim();
  }

  const loc = String(location || "");
  const locApt = loc.match(APT_RE);
  if (locApt) return locApt[1].trim();
  const locSays = loc.match(SAYS_APT_RE);
  if (locSays && looksLikeUnit(locSays[1])) return locSays[1].trim();

  return "";
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripApartmentFromDesc(desc, apartment) {
  if (!apartment) return desc;
  const u = escapeRegex(apartment);
  let out = String(desc || "");
  out = out.replace(new RegExp(`\\b(?:apt\\.?|apartment|unit|suite|#)\\s*#?\\s*${u}\\b`, "gi"), "");
  out = out.replace(new RegExp(`\\b(?:it\\s+)?says?\\s+${u}\\b`, "gi"), "");
  out = out.replace(new RegExp(`\\b(?:apt|apartment|unit)\\s+is\\s+${u}\\b`, "gi"), "");
  out = out.replace(new RegExp(`^\\s*${u}\\s*$`, "gim"), "");
  out = out.replace(/\s{2,}/g, " ").replace(/^[,\-–—:\s]+/, "").trim();
  return out || desc;
}

const STREET_RE =
  /\b(\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9][\w\s.'-]{1,50}?\s*(?:St\.?|Street|Ave\.?|Avenue|Rd\.?|Road|Blvd\.?|Boulevard|Dr\.?|Drive|Ln\.?|Lane|Ct\.?|Court|Pl\.?|Place|Way|Pkwy|Parkway)(?:\s*,?\s*[A-Za-z][\w\s-]{0,40})?(?:\s*,?\s*[A-Z]{2})?(?:\s+\d{5}(?:-\d{4})?)?)/gi;

function cleanPhone(raw) {
  const s = String(raw || "").trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return s.replace(/\s{2,}/g, " ").trim();
}

function normAddr(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function streetKey(addr) {
  const n = normAddr(addr);
  return n.split(",")[0].trim();
}

export function addressesDiffer(a, b) {
  const ka = streetKey(a);
  const kb = streetKey(b);
  if (!ka || !kb) return Boolean(ka || kb) && ka !== kb;
  if (ka === kb) return false;
  const na = normAddr(a);
  const nb = normAddr(b);
  return !(na.includes(kb) || nb.includes(ka));
}

function extractEmail(desc) {
  const m = desc.match(EMAIL_RE);
  return m ? m[0].trim() : "";
}

function extractPhone(desc) {
  const labeled = desc.match(PHONE_LABELED_RE);
  if (labeled) return cleanPhone(labeled[1]);
  const loose = desc.match(PHONE_LOOSE_RE);
  if (loose) return cleanPhone(loose[0]);
  return "";
}

function extractStreetAddresses(desc) {
  const out = [];
  const seen = new Set();
  let m;
  const re = new RegExp(STREET_RE.source, STREET_RE.flags);
  while ((m = re.exec(desc))) {
    const v = m[1].trim().replace(/[,.;]+$/, "");
    const key = normAddr(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function looksLikeAddressLine(line) {
  return /\d{1,6}\s+\w/.test(line) && /\b(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|ct|court|pl|place|way|pkwy)\b/i.test(line);
}

function looksLikeContactLine(line) {
  const s = String(line || "").trim();
  if (!s || EMAIL_RE.test(s) || PHONE_LOOSE_RE.test(s) || looksLikeAddressLine(s)) return false;
  if (/^(customer|contact|bill|phone|tel|cell|email|notes?)\b/i.test(s)) return false;
  return /[A-Za-z]{2,}/.test(s);
}

function parseNames(desc) {
  let businessName = "";
  let personName = "";

  const cust = desc.match(CUSTOMER_RE);
  if (cust) {
    personName = cust[1].trim().replace(/[,.;]$/, "");
  }

  const contact = desc.match(CONTACT_RE);
  if (contact) {
    const name = contact[1].trim().replace(/[,.;]$/, "");
    if (!personName) personName = name;
    else if (!businessName) businessName = personName, personName = name;
  }

  const lines = desc
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (EMAIL_RE.test(line) || PHONE_LOOSE_RE.test(line) || looksLikeAddressLine(line)) continue;
    if (/^(customer|contact|bill)\b/i.test(line)) continue;
    if (/\b(LLC|Inc\.?|Corp\.?|Co\.?|Company|Electric|Plumbing|Properties)\b/i.test(line)) {
      if (!businessName) businessName = line.replace(/[,.;]+$/, "");
      continue;
    }
    if (looksLikeContactLine(line)) {
      if (!businessName) businessName = line.replace(/[,.;]+$/, "");
      else if (!personName) personName = line.replace(/[,.;]+$/, "");
    }
  }

  return { businessName, personName };
}

function summaryCustomer(summary) {
  return (
    (summary || "")
      .replace(/(service call|estimate|install.*?)[—\-:]/i, "")
      .trim() || summary || ""
  );
}



/** Prefill parser — calendar description + location → job/customer fields. */
export function prefillFromEvent(e) {
  const desc = String(e?.description || "");
  const location = String(e?.location || "").trim();

  const apartment = extractApartment(desc, location);

  const email = extractEmail(desc);
  const phone = extractPhone(desc);
  const names = parseNames(desc);

  let billingAddress = "";
  const billTo = desc.match(BILL_TO_RE);
  if (billTo) {
    billingAddress = billTo[1].trim().replace(/[,.;]+$/, "");
  } else {
    const streets = extractStreetAddresses(desc);
    const alt = streets.find((addr) => location && addressesDiffer(addr, location));
    if (alt) billingAddress = alt;
  }

  const serviceAddress = location || "";
  if (!billingAddress && serviceAddress) {
    billingAddress = serviceAddress;
  }

  let businessName = names.businessName;
  let personName = names.personName;
  if (!businessName && personName) businessName = personName;

  let customer = businessName || personName || summaryCustomer(e?.summary);

  const description = stripApartmentFromDesc(desc, apartment);

  return {
    customer,
    businessName: businessName || customer,
    personName,
    title: e?.summary || "",
    address: serviceAddress,
    serviceAddress,
    billingAddress,
    phone,
    email,
    date: evStart(e).slice(0, 10),
    calEventId: e?.id || "",
    apartment,
    description: description || desc,
  };
}

/** Merge calendar prefill with an existing customer's service address (new job at that site). */
export function prefillAtServiceAddress(event, customerJobs, atAddressKey) {
  const cal = prefillFromEvent(event);
  if (!atAddressKey || !customerJobs?.length) return cal;
  const anchor = customerJobs.find((j) => serviceAddressKey(j) === atAddressKey);
  if (!anchor) return cal;
  const base = cloneJobAtAddressPatch(anchor);
  return {
    ...cal,
    ...base,
    title: cal.title,
    date: cal.date,
    description: cal.description,
    calEventId: cal.calEventId,
    phone: cal.phone || base.phone,
    email: cal.email || base.email,
    apartment: base.apartment || cal.apartment,
    invoiceNo: "",
    estimateNo: "",
  };
}