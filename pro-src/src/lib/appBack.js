// Android / PWA hardware back — stay in-app, double-back-at-home to exit.

export const DOUBLE_BACK_MS = 2000;

const ROOT_EXACT = new Set([
  "/",
  "/today",
  "/calls",
  "/time",
  "/projects",
  "/company",
  "/progress",
  "/dev",
  "/archive",
]);

/** Current hash route path (no query), e.g. `/job/J-1`. */
export function parseHashPath(hash = typeof window !== "undefined" ? window.location.hash : "") {
  const raw = String(hash || "").replace(/^#/, "");
  const path = raw.split("?")[0] || "/";
  if (!path.startsWith("/")) return "/" + path;
  return path;
}

export function parseHashSearch(hash = typeof window !== "undefined" ? window.location.hash : "") {
  const raw = String(hash || "").replace(/^#/, "");
  const q = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
  return q ? "?" + q : "";
}

/** Main tab or hub — single back should not exit the app. */
export function isRootRoute(pathname) {
  if (ROOT_EXACT.has(pathname)) return true;
  if (/^\/projects\/[^/]+$/.test(pathname)) return true;
  return false;
}

export function isDetailRoute(pathname) {
  return pathname.startsWith("/job/") || pathname.startsWith("/customer/");
}

/** Where the in-app back arrow would go from a detail screen. */
export function detailBackTarget(pathname, search = "") {
  if (pathname.startsWith("/job/")) {
    const id = decodeURIComponent(pathname.slice(5));
    const fromCust = new URLSearchParams(search.replace(/^\?/, "")).get("from");
    if (fromCust) {
      return `/customer/${encodeURIComponent(fromCust)}?job=${encodeURIComponent(id)}`;
    }
    return "/";
  }
  if (pathname.startsWith("/customer/")) return "/";
  return "/";
}

export function isDoubleBack(now, lastAt, windowMs = DOUBLE_BACK_MS) {
  return lastAt > 0 && now - lastAt < windowMs;
}