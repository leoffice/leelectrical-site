/* LE Pro service worker — simple cache-first for static assets.
 * API calls (/.netlify/functions/*) always go to the network.
 * Bump CACHE version to invalidate old assets after a deploy. */
const CACHE = "le-pro-v216";
const CORE = ["/app/pro/", "/app/pro/index.html", "/app/pro/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Never cache the API — live business data.
  if (url.pathname.startsWith("/.netlify/")) return;
  // Only handle our own scope.
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/app/pro/")) return;
  // version.json must always hit the network — stale sha causes reload loops.
  if (url.pathname.endsWith("/version.json")) return;

  // Navigations: network-first so a new deploy shows up, cache fallback offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/app/pro/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/app/pro/index.html"))
    );
    return;
  }

  // Assets: cache-first (hashed filenames make this safe).
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
    )
  );
});
