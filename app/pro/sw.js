/* LE Pro service worker — network-first shell so deploys never leave unstyled HTML.
 * API calls (/.netlify/functions/*) always go to the network.
 * Bump CACHE version to invalidate old assets after a deploy.
 *
 * Why network-first for CSS/JS entry:
 * Cache-first + mid-deploy HTML/asset hash skew produced "unstyled LE Pro"
 * (raw blue links, both mobile+desktop chrome, stuck Loading…) and a twitchy
 * reload loop while the client chased a new SW. Hashed filenames are still
 * cacheable after a successful network hit.
 */
const CACHE = "le-pro-v360";
// Do not pre-cache index.html — a stale shell + new CSS hash = unstyled raw links.
const CORE = ["/app/pro/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      // Drop ALL prior LE Pro caches on activate (unstyled-shell recovery)
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // Nudge open tabs to reload once so they pick up the new CSS/JS pair
        return self.clients.matchAll({ type: "window" }).then((clients) => {
          for (const c of clients) {
            try {
              c.postMessage({ type: "SW_ACTIVATED", cache: CACHE });
            } catch {
              /* ignore */
            }
          }
        });
      }),
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data && e.data.type === "CLEAR_CACHES") {
    e.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});

function networkFirst(request, { cachePath } = {}) {
  return fetch(request)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(cachePath || request, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(cachePath || request));
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Never cache the API — live business data.
  if (url.pathname.startsWith("/.netlify/")) return;
  // Only handle our own scope.
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/app/pro/")) return;
  // version.json must always hit the network — stale sha causes reload loops.
  if (url.pathname.endsWith("/version.json") || url.pathname.endsWith("/sw.js")) return;

  // Navigations: always network-first so a new deploy's index (with correct CSS/JS
  // hashes) wins. Do NOT pin index.html in CORE — a stale shell is what made the
  // UI render without Tailwind (raw blue links).
  if (e.request.mode === "navigate" || url.pathname === "/app/pro/" || url.pathname.endsWith("/index.html")) {
    e.respondWith(networkFirst(e.request, { cachePath: "/app/pro/index.html" }));
    return;
  }

  // Stylesheets + main module: network-first (prevents unstyled shell after deploy).
  const isCss = url.pathname.endsWith(".css");
  const isEntryJs =
    url.pathname.endsWith(".js") &&
    (url.pathname.includes("/assets/index-") || url.pathname.includes("/assets/main-"));
  if (isCss || isEntryJs) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Other hashed assets: cache-first is safe.
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          }
          return res;
        }),
    ),
  );
});
