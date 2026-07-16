/** Canonical apex — used for customer-facing links (pay pages, doc URLs). */
export const CANONICAL_ORIGIN = "https://leelectrical.us";

/**
 * Origin that actually SERVES /.netlify/functions/*.
 *
 * The backend migrated Netlify → Cloudflare Pages Functions. When the apex
 * leelectrical.us moved to Cloudflare it STOPPED serving /.netlify/functions/*
 * — those paths now fall through to the SPA shell (index.html), so every API
 * fetch got HTML back → "Unexpected token '<', "<!DOCTYPE"... is not valid JSON".
 * The ported functions are served by the leelectrical-cf Pages project's
 * cf-native deployment, which sends CORS `access-control-allow-origin: *`.
 */
export const FUNCTIONS_ORIGIN = "https://cf-native.leelectrical-cf.pages.dev";

/** Base URL for /.netlify/functions API calls. */
export function functionsBase() {
  // Same-origin when the app is served from the functions host itself.
  if (
    typeof location !== "undefined" &&
    (location.hostname === "cf-native.leelectrical-cf.pages.dev" ||
      location.hostname === "leelectrical-cf.pages.dev")
  ) {
    return "/.netlify/functions";
  }
  return `${FUNCTIONS_ORIGIN}/.netlify/functions`;
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