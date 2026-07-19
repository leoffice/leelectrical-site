// Product brand mark shown on customer-facing DOCUMENTS (invoice / estimate
// PDFs), mirroring the mark on outbound emails.
//
// The tenant's own company block is the primary header (see tenantProfile.js);
// this mark is the small constant underneath. Same model as the email:
// their brand on top, ours underneath.
//
// ── WORDING DOES NOT LIVE HERE ANYMORE ──────────────────────────────────────
// The text is a single swappable value in shared/productBrand.mjs, overridable
// per tenant via tenant_config.product.poweredBy. "Powered by LE" is the
// current DEFAULT, not a fixed string — renaming the product is a one-value
// change there, not a sweep through this codebase.
//
// The server side (netlify/functions/lib/emailBranding.mjs) imports the same
// shared module, so the two can no longer drift.

import { productPoweredBy } from "./tenantBranding.js";
import { onTenantConfigChange } from "./tenantBranding.js";

/**
 * The document mark for the active tenant. Prefer this in new code.
 */
export function poweredByMark() {
  return productPoweredBy();
}

/**
 * Live ESM binding kept for the PDF builders that import it as a plain string
 * (invoicePdf.js, qbInvoicePdf.js). Refreshed on config change rather than
 * captured at import, so it reflects the tenant whose config is live.
 */
export let POWERED_BY_LE = productPoweredBy();

onTenantConfigChange(() => {
  POWERED_BY_LE = productPoweredBy();
});

/**
 * Footer mark colour, as a PDF RGB triple (0-1).
 * Deliberately NOT the #8d9096 body-footer gray: that reads as near-invisible
 * low-contrast text on white. This is #4b5563 (slate-600) — muted enough to
 * stay subordinate to the tenant's brand, dark enough to be plainly legible
 * (~7:1 on white, comfortably above WCAG AA for small text).
 */
export const POWERED_BY_LE_PDF_COLOR = [75 / 255, 85 / 255, 99 / 255];

/** Point size for the document footer mark — small but readable in print. */
export const POWERED_BY_LE_PDF_SIZE = 8.5;
