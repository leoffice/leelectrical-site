// Nav + route registry, gated by tenant_config.
//
// GOLDEN RULE: one registry drives BOTH the nav links and the registered
// routes. A module that is off disappears from the nav *and* its <Route> is
// never mounted, so typing the URL falls through to the catch-all Not-found.
// Deriving both from the same list is what keeps them from drifting apart —
// the failure mode where a link is hidden but the page is still reachable.
//
// `module`   — gated by tenant_config.modules[key]
// `internal` — gated by tenant_config.internal (dev tooling)
// neither    — core surface, always on for every tenant

import { isInternal, isModuleEnabled } from "./tenantConfig.js";

/**
 * Every nav destination, in sidebar order.
 *
 * Routes NOT listed here are core sub-pages with no nav entry — see
 * CORE_ROUTES below.
 */
export const NAV_ITEMS = [
  { to: "/", label: "Customers", ic: "🗂️", end: true },
  { to: "/today", label: "Calendar", ic: "📅" },
  { to: "/reminders", label: "Reminders", ic: "🔔" },
  { to: "/time", label: "Time", ic: "⏱️", module: "crew" },
  { to: "/projects", label: "Requisition", ic: "📋", module: "requisitions" },
  { to: "/company", label: "Company", ic: "📊", module: "reports" },
  { to: "/settings", label: "Settings", ic: "⚙️" },
  { to: "/progress", label: "Build", ic: "⚡", internal: true },
  { to: "/dev", label: "Dev", ic: "🛠️", internal: true },
  { to: "/archive", label: "Archive", ic: "📦" },
];

/**
 * Route paths keyed by the nav entry that owns them. A nav item may own more
 * than one path (e.g. Requisition owns its detail route) — all of them must be
 * stripped together, or the detail URL stays reachable after the list is gone.
 */
export const ROUTE_PATHS = {
  "/": ["/"],
  "/today": ["/today"],
  "/reminders": ["/reminders"],
  "/time": ["/time"],
  "/projects": ["/projects", "/projects/:projectId"],
  "/company": ["/company"],
  "/settings": ["/settings"],
  "/progress": ["/progress"],
  "/dev": ["/dev"],
  "/archive": ["/archive"],
};

/** Core sub-pages with no nav entry. Always registered. */
export const CORE_ROUTES = ["/job/:id", "/customer/:key"];

/** Does this tenant have access to this nav entry? */
export function isNavItemAllowed(item, config) {
  if (item.internal && !isInternal(config)) return false;
  if (item.module && !isModuleEnabled(config, item.module)) return false;
  return true;
}

/** Nav entries this tenant may see. */
export function visibleNavItems(config) {
  return NAV_ITEMS.filter((item) => isNavItemAllowed(item, config));
}

/**
 * Route paths this tenant may reach. Anything absent from this list is
 * genuinely unrouted — not merely unlinked.
 */
export function allowedRoutePaths(config) {
  const paths = [...CORE_ROUTES];
  for (const item of NAV_ITEMS) {
    if (!isNavItemAllowed(item, config)) continue;
    paths.push(...(ROUTE_PATHS[item.to] || [item.to]));
  }
  return paths;
}

/** Convenience for tests + guards: is this exact path registered? */
export function isRouteAllowed(path, config) {
  return allowedRoutePaths(config).includes(path);
}
