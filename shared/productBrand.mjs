// ─────────────────────────────────────────────────────────────────────────────
// THE PRODUCT BRAND LIVES HERE. ONE FILE. CHANGE IT AND THE RENAME IS DONE.
// ─────────────────────────────────────────────────────────────────────────────
//
// "LE Pro", "LE" and "Powered by LE" are the CURRENT DEFAULTS, not fixed
// strings. Renaming the product to "Level" (or anything else) should be a
// one-value edit in this file — never a find-and-replace across the codebase.
//
// This module is deliberately dependency-free and lives at the repo root so
// BOTH sides can import the same values:
//   - the PWA          (pro-src/src/lib/brand.js -> tenantBranding.js)
//   - the mail/PDF fns (netlify/functions/lib/emailBranding.mjs)
// Previously each side had its own copy kept in sync by a test. One file
// removes the class of bug entirely.
//
// PER-TENANT OVERRIDE: a tenant_config may carry a `product` block that
// overrides any of these (see pro-src/src/lib/tenantConfig.js). These are the
// platform defaults used when a tenant sets nothing — including for the
// LE-internal tenant, whose brand may itself change.

/** Platform default product brand. Override per tenant via tenant_config.product. */
export const PRODUCT_BRAND = {
  /** Full product name, shown in UI chrome, emails and documents. */
  name: "LE Pro",

  /** Short umbrella mark, used where the full name doesn't fit. */
  shortName: "LE",

  /**
   * The mark under the tenant's own brand on emails and documents —
   * "his brand on top, ours underneath", the Shopify model.
   * Levi was weighing "Powered by LE" vs "LE Products"; change it here.
   */
  poweredBy: "Powered by LE",

  /** Product logo served from the app's public/ directory. */
  logoFile: "le-logo.png",
};

/**
 * STRINGS THAT MUST NOT FOLLOW A RENAME.
 *
 * These appear in STORED DATA or on an EXTERNAL PROTOCOL, so they are matched
 * against records written before any rename. Renaming the product must not
 * orphan that data — readers keep accepting the legacy value AND the current
 * product name. Do not "clean these up".
 */
export const LEGACY_BRAND_TOKENS = Object.freeze([
  // Prefix on payment notes written by earlier builds and by the QBO sync.
  // src/lib/payments.js strips it when deriving a payment method.
  "recorded from le pro",
]);

/** Merge a tenant_config `product` override onto the platform defaults. */
export function resolveProductBrand(override) {
  const o = override && typeof override === "object" ? override : {};
  return {
    name: str(o.name) || PRODUCT_BRAND.name,
    shortName: str(o.shortName) || PRODUCT_BRAND.shortName,
    poweredBy: str(o.poweredBy) || PRODUCT_BRAND.poweredBy,
    logoFile: str(o.logoFile) || PRODUCT_BRAND.logoFile,
    logoUrl: str(o.logoUrl) || "",
  };
}

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * True when `note` starts with a brand token that should be discarded rather
 * than treated as a payment method — either the legacy literal or the
 * current product name. Keeps historical records parsing correctly across a
 * rename.
 */
export function isBrandNoteToken(value, productName = PRODUCT_BRAND.name) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return false;
  if (LEGACY_BRAND_TOKENS.includes(v)) return true;
  return v === `recorded from ${String(productName).toLowerCase()}`;
}
