// Browser adapter for the QuickBooks-clone invoice/estimate PDF.
//
// The renderer itself moved to shared/qbDocPdf.mjs so Cloudflare Pages
// Functions can render the same bytes server-side — that is what lets the
// customer pay page fetch an invoice without the office Mac being online.
// The renderer is deliberately state-free, so this adapter's job is to inject
// the live tenant branding it can no longer import, and to hand back a Blob
// (which is what every existing caller expects).
import { buildQbDocPdfBytes } from "../../../shared/qbDocPdf.mjs";
import { POWERED_BY_LE } from "./brand.js";
import { activeTenantConfig, tenantCompany } from "./tenantBranding.js";

export { qbMoney } from "../../../shared/qbDocPdf.mjs";

/**
 * Render a QuickBooks-clone invoice/estimate as a PDF Blob.
 * `data` is the mapJobToQbDocData shape — see buildQbDocPdfBytes for the full
 * field list. Branding is filled in here rather than by the caller.
 */
export function buildQbDocPdf(data) {
  const bytes = buildQbDocPdfBytes({
    ...data,
    // Read at call time, not module load: POWERED_BY_LE is a live binding that
    // brand.js re-assigns whenever tenant config changes.
    poweredBy: POWERED_BY_LE,
    tenant: tenantCompany(),
    profile: activeTenantConfig().profile || {},
  });
  return new Blob([bytes], { type: "application/pdf" });
}
