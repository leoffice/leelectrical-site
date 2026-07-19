// Branding resolution — the single place that turns a tenant_config into the
// strings and images the app renders.
//
// Before this existed, every PDF builder, email template and chrome surface
// carried its own copy of "BLZ Electric Inc." and friends. Four separate
// copies of the payment-instruction block had already drifted apart. Anything
// customer-visible should come from here.
//
// Deliberately NOT tenant-configurable (do not "fix" these):
//   - POWERED_BY_LE in brand.js — the product mark, constant across tenants.
//   - RP_NAME in lock.js — the WebAuthn relying-party name. Changing it
//     invalidates every enrolled biometric credential.
//   - "LE Pro" product chrome — the product name, not the tenant's name.
//   - CANONICAL_ORIGIN in functionsBase.js — a hostname allowlist.

import { resolveTenantConfig } from "./tenantConfig.js";

/** Module-level snapshot so non-React callers (PDF builders) can read it. */
let current = resolveTenantConfig(null);

/** Called by TenantProvider once config resolves. */
export function setActiveTenantConfig(config) {
  if (config) current = config;
}

export function activeTenantConfig() {
  return current;
}

/**
 * COMPANY-shaped block for invoice / estimate / QBO PDF headers.
 * Replaces the duplicated COMPANY consts in invoicePdf.js and jobToQbDoc.js.
 */
export function tenantCompany(config = current) {
  const p = config.profile || {};
  const b = config.branding || {};
  return {
    name: b.companyName || p.companyName || "",
    street: p.street || "",
    cityStateZip: p.cityStateZip || "",
    phone: p.phone || "",
    email: p.email || "",
    license: p.license || "",
  };
}

/** Address as the array shape jobToQbDoc/qbInvoicePdf want. */
export function tenantAddressLines(config = current) {
  const p = config.profile || {};
  return [p.street, p.cityStateZip].filter(Boolean);
}

/**
 * Payment instruction lines, built from the tenant's enabled methods.
 * One generator replacing the four hand-maintained copies.
 */
export function tenantPaymentLines(config = current) {
  const p = config.profile || {};
  const methods = p.paymentMethods || {};
  const lines = [];
  if (methods.card !== false && p.payLinkBase) {
    lines.push("-Card: Pay online with the secure link on this invoice.");
  }
  if (methods.zelle !== false && p.zelleInstructions) {
    lines.push(`-${p.zelleInstructions}`);
  }
  if (methods.check !== false && p.checkInstructions) {
    lines.push(`-${p.checkInstructions}`);
  }
  return lines;
}

/**
 * Short trading name for prose and sign-offs — "BLZ Electric", not
 * "BLZ Electric Inc.". Customer-facing copy uses the short form; only document
 * headers use the legal name from tenantCompany().
 */
export function tenantShortName(config = current) {
  const p = config.profile || {};
  return p.shortName || tenantCompany(config).name || "";
}

/** Sign-off used in customer emails / SMS, e.g. "— BLZ Electric". */
export function tenantSignOff(config = current) {
  const name = tenantShortName(config);
  return name ? `— ${name}` : "";
}

/** Display company name, safe for alt text and headings. */
export function tenantName(config = current) {
  return tenantCompany(config).name || "";
}

/** Support / office email for customer-facing copy. */
export function tenantSupportEmail(config = current) {
  const b = config.branding || {};
  const p = config.profile || {};
  return b.supportEmail || p.email || "";
}

/** Calendar account for Google Calendar links + sync copy. */
export function tenantCalendarAccount(config = current) {
  return config.profile?.calendarAccount || "";
}

/** Address for the sidebar / pay-page sub-line, e.g. "Brooklyn, NY". */
export function tenantLocality(config = current) {
  const cityStateZip = config.profile?.cityStateZip || "";
  // "Brooklyn, NY 11213" -> "Brooklyn, NY"
  return cityStateZip.replace(/\s+\d{5}(-\d{4})?$/, "").trim();
}

/**
 * App chrome strings: what the sidebar and lock screen show.
 * `product` stays constant ("LE Pro") — only the tenant line varies.
 */
export function tenantChrome(config = current) {
  const name = tenantName(config);
  const locality = tenantLocality(config);
  return {
    product: "LE Pro",
    companyName: name,
    logoAlt: name || "Company logo",
    subtitle: [name, locality].filter(Boolean).join(" · "),
    primaryColor: config.branding?.primaryColor || "#2d8a3e",
    logoUrl: config.branding?.logoUrl || "",
  };
}
