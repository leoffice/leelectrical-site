// Email branding — the white-label seam.
//
// Two separate things, deliberately:
//   HEADER  = the TENANT's brand (company name + logo). Swappable. Today the
//             only tenant is BLZ/LE, so it resolves to the LE mark.
//   FOOTER  = "Powered by LE". CONSTANT on every outbound email, whatever the
//             tenant is. This is the "his brand on top, Powered by LE
//             underneath" model (cf. "powered by Shopify").
//
// Logo delivery is a CID inline attachment (`cid:companylogo`), not a remote
// URL: Gmail and Outlook render CID parts inline without the user clicking
// "display images", whereas remote <img> is proxied and frequently blocked on
// first open. docEmail/statement already proved this path in production.

import { LOGO_PNG_BASE64 } from "./le-invoice-suite/logoBase64.mjs";

/** content_id every template references as `cid:companylogo`. */
export const LE_LOGO_CID = "companylogo";

/** Fallback header brand while BLZ/LE is the only tenant. */
export const DEFAULT_BRAND_NAME = "BLZ Electric Inc.";

/** Brand green — matches the invoice template + PDF. */
export const BRAND_GREEN = "#066a34";

/**
 * Resolve the HEADER brand from a tenant profile.
 * A future tenant supplying { name, logoUrl } swaps the header; everything
 * else (notably the Powered by LE footer) is untouched.
 */
export function resolveEmailBrand(tenant = {}) {
  const t = tenant || {};
  const name = String(t.name || t.companyName || "").trim() || DEFAULT_BRAND_NAME;
  const custom = String(t.logoSrc || t.logoUrl || "").trim();
  const logoSrc = custom || `cid:${LE_LOGO_CID}`;
  return { name, logoSrc, usesDefaultLogo: !custom };
}

/**
 * The constant "Powered by LE" footer. Present on EVERY email regardless of
 * tenant. Text-only by design — it must render even when a client blocks
 * images, and it should stay subordinate to the tenant's own header mark.
 */
export function poweredByLeHtml({ muted = "#94a3b8", rule = true } = {}) {
  return (
    `<div style="` +
    (rule ? "border-top:1px solid #e5e7eb;" : "") +
    `margin:0;padding:14px 0 18px 0;text-align:center;` +
    `font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:${muted};">` +
    `Powered by <span style="font-weight:700;color:${BRAND_GREEN};letter-spacing:.02em;">LE</span>` +
    `</div>`
  );
}

/** Plain-text counterpart for the text/* alternative part. */
export const POWERED_BY_LE_TEXT = "Powered by LE";

/** The CID logo attachment descriptor for a Resend payload. */
export function leLogoAttachment() {
  return { filename: "logo.png", content: LOGO_PNG_BASE64, content_id: LE_LOGO_CID };
}
