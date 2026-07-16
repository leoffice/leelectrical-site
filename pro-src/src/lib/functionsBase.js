/** Canonical apex — serves the CF Pages Functions + customer-facing links. */
export const CANONICAL_ORIGIN = "https://leelectrical.us";

/**
 * Base URL for /.netlify/functions API calls.
 *
 * The backend is now Cloudflare Pages Functions bundled into this same project
 * (functions/.netlify/functions/*), so the apex leelectrical.us serves
 * /.netlify/functions/* natively again. Apex = same-origin; www/previews/dev
 * call the canonical apex cross-origin (functions send CORS allow-origin:*).
 */
export function functionsBase() {
  if (typeof location !== "undefined" && location.hostname === "leelectrical.us") {
    return "/.netlify/functions";
  }
  return `${CANONICAL_ORIGIN}/.netlify/functions`;
}

/** Origin for app and customer-facing links — apex in production. */
export function siteOrigin() {
  if (typeof location !== "undefined") {
    const { protocol, hostname, port } = location;
    if (!/(^|\.)leelectrical\.us$/.test(hostname)) {
      return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
    }
  }
  return CANONICAL_ORIGIN;
}