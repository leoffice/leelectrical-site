/** Canonical apex — the fallback origin for hosts that don't bundle functions. */
export const CANONICAL_ORIGIN = "https://leelectrical.us";

/** Hosts that serve the CF Pages Functions bundle at /.netlify/functions on
 *  their OWN origin: every leelectrical.us host (apex + www) and every
 *  leelectrical-cf.pages.dev deployment (prod alias + previews). */
function servesFunctionsSameOrigin(hostname) {
  return /(^|\.)leelectrical\.us$/.test(hostname) || /\.leelectrical-cf\.pages\.dev$/.test(hostname);
}

/** Base URL for /.netlify/functions API calls.
 *  Same-origin (relative) wherever the functions bundle is co-hosted — since
 *  the 2026-07 CF Pages migration that includes www, not just the apex. Going
 *  same-origin kills the cross-origin CORS preflight (an extra OPTIONS round
 *  trip before every POST) and lets the browser reuse one HTTP cache entry per
 *  endpoint for ETag revalidation. Non-app hosts (localhost dev, the extension)
 *  keep the absolute apex URL. The demo tenant intercepts fetch entirely, so
 *  the value it sees here is moot. */
export function functionsBase() {
  if (typeof location !== "undefined" && servesFunctionsSameOrigin(location.hostname)) {
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