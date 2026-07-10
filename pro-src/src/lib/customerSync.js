// QuickBooks customer sync payload — billing/contact fields only.
// Service address is per invoice/estimate (ShipAddr on that document in QBO) and
// must NEVER be sent as the customer's BillAddr on customer_sync.
import { parseUSAddress } from "./solaPayUrl.js";

/** Canonical service location for a job (ShipAddr on its invoice/estimate). */
export function effectiveServiceAddress(job) {
  const j = job || {};
  return j.serviceAddress || j.address || "";
}

/** Service address with apartment/unit for list rows. */
export function serviceAddressDisplay(job) {
  return withApartment(effectiveServiceAddress(job), job?.apartment);
}

function addressLooksComplete(raw) {
  const s = String(raw || "").trim();
  if (!s) return false;
  if (/\d{5}(?:-\d{4})?\s*$/.test(s)) return true;
  return /,\s*[^,]+,\s*[A-Za-z]{2}(\s+\d{5}(?:-\d{4})?)?\s*$/.test(s);
}

function withApartment(street, apt) {
  const line = String(street || "").trim();
  const unit = String(apt || "").trim();
  if (!line) return "";
  if (!unit) return line;
  const low = line.toLowerCase();
  if (low.includes(unit.toLowerCase()) || /\b(apt|apartment|unit|suite|#)\b/i.test(line)) return line;
  return `${line}, Apt ${unit}`;
}

/** Full service location for Google Calendar (street + apt + city/state/zip). */
export function calendarServiceLocation(job) {
  const j = job || {};
  const street = String(j.serviceAddress || j.address || "").trim();
  if (!street) return "";

  const apt = String(j.apartment || "").trim();
  let line1 = withApartment(street, apt);
  if (addressLooksComplete(line1)) return line1;

  const svc = parseUSAddress(street);
  const bill = parseUSAddress(j.billingAddress || "");
  line1 = withApartment(svc.street || street, apt);

  const city = svc.city || bill.city || "";
  const state = svc.state || bill.state || "";
  const zip = svc.zip || bill.zip || String(j.zip || "").trim() || "";
  const tail = [city, state].filter(Boolean).join(", ");
  const suffix = zip ? (tail ? `${tail} ${zip}` : zip) : tail;
  return suffix ? `${line1}, ${suffix}` : line1;
}

/** UI label — service address is tied to the invoice or estimate number. */
export function serviceAddressLabel(job, fallback = "Service address") {
  const j = job || {};
  if (j.invoiceNo) return `Service address (invoice #${j.invoiceNo})`;
  if (j.estimateNo) return `Service address (estimate #${j.estimateNo})`;
  return fallback;
}

/** Short hint for service-address fields in forms. */
export function serviceAddressHint(job) {
  const j = job || {};
  if (j.invoiceNo || j.estimateNo) {
    return "Where we performed work for this invoice/estimate (QuickBooks ShipAddr).";
  }
  return "Where this job is being done — goes on the invoice or estimate when created.";
}

/** Display name for UI headers (business name preferred). */
export function customerDisplayName(job) {
  const j = job || {};
  return j.businessName || j.customer || "";
}

/** True when name, phone, email, and billing address are all on file (QBO-complete profile). */
export function customerProfileComplete(contact) {
  const c = contact || {};
  const name = String(c.businessName || c.name || "").trim();
  const phone = String(c.phone || "").trim();
  const email = String(c.email || "").trim();
  const billing = String(c.billingAddress || "").trim();
  return !!(name && phone && email && billing);
}

/** Jobs list card tint — green when linked to QuickBooks and profile is complete; orange otherwise. */
export function customerSyncCardClass(contact) {
  const c = contact || {};
  const name = String(c.businessName || c.name || "").trim();
  if (!name) return "";
  const linked = String(c.qboCustomerId || "").trim();
  return customerProfileComplete(c) && linked
    ? "bg-emerald-50/95 border-emerald-300/90"
    : "bg-orange-50/95 border-orange-200/90";
}

/** Map a QuickBooks customer record onto LE Pro job fields. */
export function qboCustomerToJobPatch(customer) {
  const c = customer || {};
  const name = c.businessName || c.name || "";
  return {
    businessName: name,
    customer: name,
    personName: c.personName || "",
    phone: c.phone || "",
    email: c.email || "",
    billingAddress: c.billingAddress || c.addr || "",
    qboCustomerId: c.id || "",
  };
}

/** Payload for customer_sync / create_customer / update_customer commands. */
export function customerSyncPayload(job) {
  const j = job || {};
  const billing = j.billingAddress || j.billingAddr || "";
  const name = j.businessName || j.customer || j.name || "";
  const payload = {
    name,
    businessName: j.businessName || j.customer || j.name || "",
    personName: j.personName || "",
    email: j.email || "",
    phone: j.phone || "",
    billingAddr: billing,
    // Legacy key — host listener maps this to QuickBooks BillAddr, not ShipAddr.
    addr: billing,
  };
  const parentId = String(j.parentQboCustomerId || "").trim();
  if (parentId) payload.parentId = parentId;
  return payload;
}