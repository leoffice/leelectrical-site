// Product brand mark shown on customer-facing DOCUMENTS (invoice / estimate
// PDFs), mirroring the "Powered by LE" footer on outbound emails.
//
// The tenant's own company block is the primary header (see tenantProfile.js);
// this mark is the small constant underneath. Same model as the email:
// his brand on top, Powered by LE underneath.
//
// ── WORDING LIVES HERE ──────────────────────────────────────────────────────
// Levi is still deciding between "Powered by LE" and "LE Products". Change
// this one constant and every document + email follows.
// Keep in sync with POWERED_BY_LE_TEXT in
// netlify/functions/lib/emailBranding.mjs — a test asserts they match.
export const POWERED_BY_LE = "Powered by LE";

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
