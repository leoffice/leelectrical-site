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
// Same module the PWA imports — the two sides can no longer drift.
import { resolveProductBrand } from "../../../shared/productBrand.mjs";

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

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/**
 * The product mark footer. Present on EVERY email regardless of tenant.
 * Text-only by design — it must render even when a client blocks images, and
 * it should stay subordinate to the tenant's own header mark.
 *
 * The wording is NOT a literal here: it comes from shared/productBrand.mjs
 * (optionally overridden per tenant), so renaming the product is one value.
 * The short mark inside the phrase is emphasised wherever it appears, which
 * keeps the "Powered by **LE**" treatment working for any replacement pair.
 */
export function poweredByLeHtml({ muted = "#94a3b8", rule = true, product } = {}) {
  const brand = resolveProductBrand(product);
  const phrase = escapeHtml(brand.poweredBy);
  const mark = escapeHtml(brand.shortName);
  const emphasised =
    mark && phrase.includes(mark)
      ? phrase.replace(
          mark,
          `<span style="font-weight:700;color:${BRAND_GREEN};letter-spacing:.02em;">${mark}</span>`
        )
      : phrase;
  return (
    `<div style="` +
    (rule ? "border-top:1px solid #e5e7eb;" : "") +
    `margin:0;padding:14px 0 18px 0;text-align:center;` +
    `font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:${muted};">` +
    emphasised +
    `</div>`
  );
}

/** Plain-text counterpart for the text/* alternative part. */
export function poweredByText(product) {
  return resolveProductBrand(product).poweredBy;
}

/**
 * Back-compat constant for callers that import the plain string. Reflects the
 * platform default; pass a tenant's `product` block to poweredByText() when
 * per-tenant wording matters.
 */
export const POWERED_BY_LE_TEXT = poweredByText();

/** The CID logo attachment descriptor for a Resend payload. */
export function leLogoAttachment() {
  return { filename: "logo.png", content: LOGO_PNG_BASE64, content_id: LE_LOGO_CID };
}

/* ==========================================================================
 * STANDARD BRANDED EMAIL TEMPLATE (reusable across all customer emails)
 *   HEADER  — letterhead banner: LE/BLZ green logo + company line
 *   BODY    — the specific email's content (passed in)
 *   SIGNATURE — Gmail-style sign-off: name, title, company · license, phone,
 *               email, website + small logo
 *   FOOTER  — constant "Powered by LE"
 * Used by: Con Ed application email, statement email, invoice/estimate email,
 * and generic customer emails, so every message is instantly recognizable.
 * ========================================================================== */

/** Company identity for header + signature (tenant-overridable later). */
export const COMPANY_INFO = {
  name: "BLZ Electric Inc.",
  license: "Lic #11212",
  phone: "(718) 594-1850",
  phoneTel: "+17185941850",
  email: "Office@LeElectrical.us",
  cityState: "Brooklyn, NY",
  website: "leelectrical.us",
  /** Billing / office street — shown on every letterhead (Levi 2026-08-03). */
  billingAddress: "383 Kingston Ave",
  billingCityStateZip: "Brooklyn, NY 11213",
};

/** Default signer for the Gmail-style signature. Override per-email as needed. */
export const DEFAULT_SIGNER = { name: "Levi Kumer", title: "President" };

/**
 * Gmail-style signature block. Small logo left (green rule), details right.
 * @param {object} [opts]
 * @param {{name?:string,title?:string}} [opts.signer]
 * @param {object} [opts.tenant]  future white-label override {name, logoSrc}
 */
export function signatureBlockHtml({ signer = {}, tenant = {} } = {}) {
  const brand = resolveEmailBrand(tenant);
  const co = COMPANY_INFO;
  const name = escapeHtml(signer.name || DEFAULT_SIGNER.name);
  const title = escapeHtml(signer.title || DEFAULT_SIGNER.title);
  const coName = escapeHtml(brand.name || co.name);
  return (
    `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:18px 26px 6px;border-top:1px solid #e5e7eb;padding-top:16px;font-family:Arial,Helvetica,sans-serif;">` +
    `<tr>` +
    `<td valign="top" style="padding-right:14px;border-right:3px solid ${BRAND_GREEN};">` +
    `<img src="${brand.logoSrc}" alt="${coName}" width="46" style="width:46px;height:auto;display:block;" />` +
    `</td>` +
    `<td valign="top" style="padding-left:14px;font-size:13px;line-height:1.55;color:#1f2937;">` +
    `<div style="font-weight:800;color:#0f3d24;font-size:14px;">${name}</div>` +
    (title ? `<div style="color:#5b6b82;">${title}</div>` : "") +
    `<div style="font-weight:700;color:${BRAND_GREEN};margin-top:4px;">${coName} · ${escapeHtml(co.license)}</div>` +
    `<div style="margin-top:2px;"><a href="tel:${co.phoneTel}" style="color:#1f2937;text-decoration:none;">${escapeHtml(co.phone)}</a>` +
    ` &nbsp;·&nbsp; <a href="mailto:${co.email}" style="color:${BRAND_GREEN};text-decoration:none;">${escapeHtml(co.email)}</a></div>` +
    `<div style="margin-top:2px;"><a href="https://${co.website}" style="color:${BRAND_GREEN};text-decoration:none;">${escapeHtml(co.website)}</a></div>` +
    `</td></tr></table>`
  );
}

/** Plain-text signature for the text/* alternative part. */
export function signatureText({ signer = {} } = {}) {
  const co = COMPANY_INFO;
  const name = signer.name || DEFAULT_SIGNER.name;
  const title = signer.title || DEFAULT_SIGNER.title;
  return [
    "—",
    name + (title ? `, ${title}` : ""),
    `${co.name} · ${co.license}`,
    `${co.phone} · ${co.email}`,
    co.website,
  ].join("\n");
}

/**
 * The standard branded email shell. Wrap ANY body content with this so every
 * customer email shares the same header + signature + footer.
 * @param {object} opts
 * @param {string} opts.bodyHtml   inner body HTML for the middle section
 * @param {{name?:string,title?:string}} [opts.signer]
 * @param {object} [opts.tenant]
 * @param {string} [opts.product]  Powered-by product override
 * @param {boolean} [opts.signature=true]  include the signature block
 * @param {string} [opts.preheader]  hidden inbox-preview text
 */
export function buildBrandedEmailHtml({
  bodyHtml = "",
  signer = {},
  tenant = {},
  product,
  signature = true,
  preheader = "",
} = {}) {
  const brand = resolveEmailBrand(tenant);
  const co = COMPANY_INFO;
  const coName = escapeHtml(brand.name || co.name);
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>`
    : "";
  return (
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">` +
    pre +
    `<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e6e9ee;border-radius:10px;overflow:hidden;">` +
    // HEADER — centered letterhead (logo + company + billing address) on every email (Levi 2026-08-03)
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>` +
    `<td align="center" style="padding:22px 24px 16px 24px;border-bottom:3px solid ${BRAND_GREEN};text-align:center;">` +
    `<img src="${brand.logoSrc}" alt="${coName}" width="64" style="width:64px;height:auto;display:block;margin:0 auto 10px auto;" />` +
    `<div style="font-size:20px;font-weight:800;color:#0f3d24;letter-spacing:.2px;line-height:1.3;">${coName}</div>` +
    `<div style="font-size:12px;color:#5b6b82;line-height:1.45;margin-top:6px;">` +
    `Licensed Electrical Contractor · ${escapeHtml(co.license)}` +
    `</div>` +
    `<div style="font-size:12px;color:#5b6b82;line-height:1.45;margin-top:2px;">` +
    `${escapeHtml(co.billingAddress || "")}` +
    (co.billingAddress ? `<br>` : "") +
    `${escapeHtml(co.billingCityStateZip || co.cityState)} · ${escapeHtml(co.phone)}` +
    `</div>` +
    `<div style="font-size:12px;color:#5b6b82;line-height:1.45;margin-top:2px;">` +
    `${escapeHtml(co.email)}` +
    `</div>` +
    `</td></tr></table>` +
    // BODY
    `<div style="padding:24px 26px 6px 26px;font-size:14px;line-height:1.6;color:#1f2937;">${bodyHtml}</div>` +
    // SIGNATURE
    (signature ? signatureBlockHtml({ signer, tenant }) : "") +
    // POWERED BY
    poweredByLeHtml({ product }) +
    `</div></body></html>`
  );
}
