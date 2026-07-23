/** Canonical apex — customer links and non-app absolute URLs. */
export const CANONICAL_ORIGIN = "https://leelectrical.us";

/**
 * Base URL for /.netlify/functions API calls.
 * After Cloudflare cutover, both apex and www serve Pages Functions — prefer
 * same-origin so Autofill POSTs skip cross-origin CORS (large check photos).
 */
export function functionsBase() {
  if (typeof location !== "undefined") {
    const host = String(location.hostname || "");
    if (host === "leelectrical.us" || host === "www.leelectrical.us") {
      return "/.netlify/functions";
    }
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