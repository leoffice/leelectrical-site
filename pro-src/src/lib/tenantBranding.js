// Branding resolution — the single place that turns a tenant_config into the
// strings and images the app renders.
//
// Before this existed, every PDF builder, email template and chrome surface
// carried its own copy of "BLZ Electric Inc." and friends. Four separate
// copies of the payment-instruction block had already drifted apart. Anything
// customer-visible should come from here.
//
// The PRODUCT brand (name, logo, "Powered by LE" wording) is also swappable —
// its defaults live in shared/productBrand.mjs and a tenant_config `product`
// block overrides them. Use productName() / productPoweredBy() below; never
// write the product name as a literal.
//
// Deliberately NOT config-driven (do not "fix" these):
//   - CANONICAL_ORIGIN in functionsBase.js — a hostname allowlist.
//   - LE_PRO_CONVO in chatConvo.js — a stable server storage key. Its VALUE
//     ("pro-levi") is data, not branding; changing it orphans chat history.
//   - The legacy tokens in shared/productBrand.mjs — they match notes on
//     records written before any rename.

import { resolveTenantConfig } from "./tenantConfig.js";

/** Module-level snapshot so non-React callers (PDF builders) can read it. */
let current = resolveTenantConfig(null);

const listeners = new Set();

/**
 * Subscribe to config changes.
 *
 * For modules that expose a live ESM binding (a plain string other modules
 * import directly) rather than a getter. Those cannot refresh themselves
 * lazily — an importer reading the binding before any of the module's own
 * functions have run would see a stale value. Subscribing removes that
 * ordering dependency. Returns an unsubscribe function.
 */
export function onTenantConfigChange(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

/** Called by TenantProvider once config resolves. */
export function setActiveTenantConfig(config) {
  if (!config) return;
  current = config;
  for (const fn of listeners) {
    try {
      fn(current);
    } catch {
      /* a bad subscriber must not break config propagation */
    }
  }
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

/* ── PRODUCT BRAND ─────────────────────────────────────────────────────────
 * Defaults from shared/productBrand.mjs, overridable per tenant. Every UI,
 * email and document reference goes through these — a rename is one value.
 */

/** Product name, e.g. "LE Pro". Never hard-code this string. */
export function productName(config = current) {
  return config.product?.name || "";
}

/** Short umbrella mark, e.g. "LE". */
export function productShortName(config = current) {
  return config.product?.shortName || "";
}

/** The mark under the tenant's brand on emails/documents, e.g. "Powered by LE". */
export function productPoweredBy(config = current) {
  return config.product?.poweredBy || "";
}

/** Product logo src — an explicit override, else the bundled default asset. */
export function productLogoUrl(config = current) {
  const explicit = config.product?.logoUrl;
  if (explicit) return explicit;
  const file = config.product?.logoFile || "";
  if (!file) return "";
  const base =
    (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/app/pro/";
  return base + file;
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
 * `product` comes from the product brand, so a rename flows through here too.
 */
export function tenantChrome(config = current) {
  const name = tenantName(config);
  const locality = tenantLocality(config);
  return {
    product: productName(config),
    companyName: name,
    logoAlt: name || "Company logo",
    subtitle: [name, locality].filter(Boolean).join(" · "),
    primaryColor: config.branding?.primaryColor || "#2d8a3e",
    logoUrl: config.branding?.logoUrl || "",
  };
}
