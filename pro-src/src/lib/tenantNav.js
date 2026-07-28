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
 *
 * `primary` — shown as its own tab in the MOBILE bottom bar. Everything else
 * is reachable there through the "More" sheet. The desktop sidebar is a
 * vertical list with room for all of them and ignores this flag.
 *
 * Why the split: the bottom bar also hosts the ＋ / 💬 action cluster, so on a
 * 375px phone every extra tab steals width from the labels. Past ~5 tabs the
 * labels visibly collide ("CustomersCalendarRemindersTime…") and the bar stops
 * being readable. Keep this list to the handful of screens used every day; add
 * new destinations WITHOUT `primary` unless you also demote something.
 */
export const NAV_ITEMS = [
  { to: "/", label: "Customers", ic: "🗂️", end: true, primary: true },
  { to: "/today", label: "Calendar", ic: "📅", primary: true },
  { to: "/reminders", label: "Reminders", ic: "🔔", primary: true },
  { to: "/time", label: "Time", ic: "⏱️", module: "crew" },
  { to: "/projects", label: "Requisition", ic: "📋", module: "requisitions", primary: true },
  { to: "/permits", label: "Permits", ic: "📄", module: "permits" },
  { to: "/company", label: "Company", ic: "📊", module: "reports" },
  { to: "/settings", label: "Settings", ic: "⚙️" },
  { to: "/progress", label: "Build", ic: "⚡", internal: true },
  { to: "/dev", label: "Dev", ic: "🛠️", internal: true },
  { to: "/archive", label: "Archive", ic: "📦" },
];

/** Hard ceiling on mobile tabs, enforced by test. See NAV_ITEMS above. */
export const MAX_MOBILE_TABS = 4;

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
  "/permits": ["/permits"],
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
 * Mobile bottom-bar tabs — the primary ones this tenant can see, capped.
 *
 * The cap is a backstop, not the mechanism: a tenant with every module on
 * still only has four `primary` entries. It exists so that adding a fifth
 * `primary` flag can never silently re-crowd the bar.
 */
export function mobileNavItems(config) {
  return visibleNavItems(config)
    .filter((item) => item.primary === true)
    .slice(0, MAX_MOBILE_TABS);
}

/**
 * Everything else the tenant may reach, for the "More" sheet. Together with
 * mobileNavItems() this is exactly visibleNavItems() — no destination can fall
 * out of the mobile UI entirely by being neither primary nor overflow.
 */
export function mobileOverflowNavItems(config) {
  const shown = new Set(mobileNavItems(config).map((i) => i.to));
  return visibleNavItems(config).filter((item) => !shown.has(item.to));
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
