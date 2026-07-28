/** Canonical apex — customer links and non-app absolute URLs. */
export const CANONICAL_ORIGIN = "https://leelectrical.us";

/** Local dev hosts (vite) that do NOT co-serve Pages Functions. */
function isLocalHost(host) {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host.endsWith(".local")
  );
}

/**
 * Base URL for /.netlify/functions API calls.
 *
 * Every CF Pages DEPLOYMENT — the apex, www, AND each *.pages.dev preview —
 * bundles and serves its own Pages Functions at the same origin. So we prefer
 * SAME-ORIGIN for any real deployed host. This (a) lets a preview exercise ITS
 * OWN branch functions instead of silently hitting prod (critical for testing
 * tenant isolation before it ships), and (b) skips cross-origin CORS on large
 * Autofill POSTs.
 *
 * Only local dev (vite, which serves no functions) falls back to the canonical
 * apex prod functions — unchanged from before.
 */
export function functionsBase() {
  if (typeof location !== "undefined") {
    const host = String(location.hostname || "");
    if (host && !isLocalHost(host)) {
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