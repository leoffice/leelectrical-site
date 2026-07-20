// QuickBooks Products & Services helpers.
//
// WHITE-LABEL: LE Electrical's real catalogue (real service names, real
// prices) lives in ./leQboCatalog.js and is reachable ONLY through
// defaultQboItems() below, via dynamic import(), gated on the internal flag.
// That keeps it out of the chunk every tenant downloads — gating the UI alone
// would still ship the prices in readable JS.
//
// Every non-internal tenant starts with an EMPTY catalogue and fills it from
// their own QuickBooks sync (POST items { op:"set" }).

import { activeTenantConfig } from "../lib/tenantBranding.js";

/**
 * The starting item catalogue for this tenant.
 *
 * Async because the internal catalogue is a separate chunk — awaiting the
 * import is what keeps LE's pricing out of the tenant bundle. Non-internal
 * tenants resolve immediately to [] and never trigger the fetch.
 */
export async function defaultQboItems() {
  if (activeTenantConfig().internal !== true) return [];
  try {
    const mod = await import("./leQboCatalog.js");
    return mod.DEFAULT_QBO_ITEMS;
  } catch {
    // Chunk failed to load — an empty picker is the safe degradation. The
    // user can still type a line item by hand.
    return [];
  }
}

/**
 * Filter an already-loaded catalogue.
 *
 * Deliberately has NO built-in fallback list. It filters exactly what it is
 * given, so there is no path by which LE's catalogue can reach a caller that
 * did not go through defaultQboItems(). (The previous version fell back to the
 * raw array here, which bypassed the internal check entirely.)
 */
export function filterQboItems(items, query) {
  const list = Array.isArray(items) ? items : [];
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return list.slice(0, 40);
  return list
    .filter((it) => {
      const hay = [it.name, it.description, it.type].filter(Boolean).join(" ").toLowerCase();
      return q.split(/\s+/).every((t) => hay.includes(t));
    })
    .slice(0, 20);
}
