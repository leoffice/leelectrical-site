// Shared ETag / conditional-GET helper for the read-heavy JSON blobs
// (jobsdata ≈ 20 MB, state). Each doc carries a monotonic `ts` bumped on every
// write, so `"<prefix><ts>"` is a stable, correct entity tag: it changes iff the
// returned document changed. A GET whose If-None-Match matches gets a 304 with
// no body — turning a repeated multi-MB poll into a few bytes on the wire while
// still guaranteeing freshness (every request revalidates; 304 only when the
// document is byte-for-byte the one the client already holds).

const BASE_HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  // If-None-Match is added by clients (and by the browser during revalidation);
  // allow it so a cross-origin caller (localhost dev, the extension) isn't
  // blocked by CORS. Same-origin callers ignore these headers entirely.
  "access-control-allow-headers": "content-type,if-none-match",
};

/** CORS preflight response. Advertises if-none-match so a cross-origin caller
 *  (localhost dev, the extension) can send it on a conditional GET without the
 *  browser blocking the follow-up request. Same-origin callers never preflight. */
export function optionsResponse() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...BASE_HEADERS, "cache-control": "no-store" },
  });
}

/** Deterministic entity tag from a document's monotonic write timestamp. */
export function etagFor(ts, prefix = "") {
  return `"${prefix}${ts || 0}"`;
}

/** A JSON Response. `cache` defaults to no-store (writes/opaque reads); pass
 *  "no-cache" for a revalidatable GET, and an `etag` to tag it. */
export function jsonResponse(obj, { etag, cache = "no-store" } = {}) {
  const headers = { ...BASE_HEADERS, "cache-control": cache };
  if (etag) headers.etag = etag;
  return new Response(JSON.stringify(obj), { headers });
}

/**
 * Conditional GET: return a bodyless 304 when the caller's If-None-Match equals
 * the current tag, otherwise the full document tagged + marked revalidatable.
 * @param {Request} req
 * @param {object} obj  the document to return on a miss
 * @param {{ prefix?: string, ts?: number }} opts  entity-tag inputs
 */
export function conditionalJson(req, obj, { prefix = "", ts = 0 } = {}) {
  const etag = etagFor(ts, prefix);
  const inm = req && req.headers && typeof req.headers.get === "function"
    ? req.headers.get("if-none-match")
    : null;
  if (inm && inm === etag) {
    return new Response(null, {
      status: 304,
      headers: { ...BASE_HEADERS, "cache-control": "no-cache", etag },
    });
  }
  return jsonResponse(obj, { etag, cache: "no-cache" });
}
