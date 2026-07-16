/** Canonical apex — Netlify functions only serve here (www is Cloudflare static). */
export const CANONICAL_ORIGIN = "https://leelectrical.us";

/** Base URL for /.netlify/functions API calls. */
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