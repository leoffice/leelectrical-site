// Tappable phone / email / address links for calendar cards and contact fields.
import { activeTenantConfig } from "./tenantBranding.js";

/**
 * The mailbox Gmail should compose from on desktop. Read at call time, not
 * import time — tenant_config resolves after this module is first evaluated.
 */
function officeEmail() {
  return activeTenantConfig().profile?.officeEmail || "";
}

export function isDesktop() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(min-width: 1024px)").matches;
}

export function googleMapsHref(address) {
  const a = String(address || "").trim();
  if (!a) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
}

export function phoneHref(phone) {
  const p = String(phone || "").trim();
  if (!p) return "";
  const digits = p.replace(/[^\d+]/g, "");
  if (!digits) return "";
  return `tel:${digits}`;
}

export function emailHref(email) {
  const e = String(email || "").trim();
  if (!e) return "";
  if (isDesktop()) {
    const authuser = officeEmail();
    return (
      "https://mail.google.com/mail/?view=cm&fs=1&to=" +
      encodeURIComponent(e) +
      (authuser ? "&authuser=" + encodeURIComponent(authuser) : "")
    );
  }
  return `mailto:${e}`;
}

/** Contact bits for a calendar event: linked job first, then description/location parse. */
export function appointmentContactInfo(event, linkedJob, prefill) {
  const job = linkedJob || null;
  const p = prefill || {};
  const phone = String(job?.phone || p.phone || "").trim();
  const email = String(job?.email || p.email || "").trim();
  const address = String(event?.location || p.serviceAddress || job?.serviceAddress || "").trim();
  return { phone, email, address };
}
