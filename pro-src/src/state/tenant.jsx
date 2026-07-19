// Tenant config provider — loads tenant_config once at app boot and hands it
// to the nav + route gates and every branding surface.
//
// Boot blocks on this fetch by design. Rendering the app first and stripping
// routes afterwards would mean a disabled route is briefly mounted and
// reachable — exactly the hole the golden rule exists to close.
//
// Offline / endpoint-down behaviour is FAIL-CLOSED: fall back to the last
// cached config, then to the build seed. For a tenant build the seed is Free
// tier, so a network failure narrows access rather than widening it.

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useStore } from "./store.jsx";
import { asLesserTenant, resolveTenantConfig, seedTenantConfig } from "../lib/tenantConfig.js";
import { setActiveTenantConfig } from "../lib/tenantBranding.js";

const CACHE_KEY = "lepro_tenant_config_v1";

/** Cap on the blocking boot fetch before falling back to cache/seed. */
const BOOT_TIMEOUT_MS = 6000;

/**
 * Read `?viewAs=<tier>` from the URL. The app uses HashRouter, so the param
 * may sit before the hash (?viewAs=pro#/) or inside it (#/settings?viewAs=pro);
 * accept either so the toggle survives in-app navigation.
 */
function previewTierFromUrl() {
  try {
    const { search, hash } = globalThis.location || {};
    const fromSearch = new URLSearchParams(search || "").get("viewAs");
    if (fromSearch) return fromSearch;
    const q = String(hash || "").indexOf("?");
    if (q === -1) return null;
    return new URLSearchParams(String(hash).slice(q + 1)).get("viewAs");
  } catch {
    return null;
  }
}

const Ctx = createContext(null);

function readCache() {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(raw) {
  try {
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(raw || {}));
  } catch {
    /* quota / private mode — cache is an optimization, not a requirement */
  }
}

export function TenantProvider({ children }) {
  const { getSettings } = useStore();
  const [raw, setRaw] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Boot blocks on this call, so it must not be able to hang the app on
        // a dead or slow endpoint. Time it out and fall back to cache/seed.
        const doc =
          typeof getSettings === "function"
            ? await Promise.race([
                getSettings(),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("settings timeout")), BOOT_TIMEOUT_MS)
                ),
              ])
            : null;
        if (!alive) return;
        // The server nests tenant_config under `tenant` and keeps the legacy
        // company `profile` alongside it; carry both.
        const next = { ...(doc?.tenant || {}), profile: doc?.profile };
        setRaw(next);
        writeCache(next);
      } catch {
        if (!alive) return;
        setRaw(readCache()); // null -> seed, which is fail-closed
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [getSettings]);

  const config = useMemo(() => {
    const resolved = resolveTenantConfig(raw);
    // `?viewAs=free|pro|full` previews the app as a lesser, non-internal
    // tenant. Downgrade-only (see asLesserTenant), so it grants nothing and
    // needs no auth — it exists so the tenant experience is demonstrable on a
    // deployment that is itself internal.
    const viewAs = previewTierFromUrl();
    return viewAs ? asLesserTenant(resolved, viewAs) : resolved;
  }, [raw]);

  // Publish to the module-level snapshot so PDF builders, email templates and
  // other non-React callers can read branding without prop-drilling.
  useEffect(() => {
    setActiveTenantConfig(config);
  }, [config]);

  if (!ready) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-sm font-semibold text-slate-400"
        data-testid="tenant-boot"
      >
        Loading…
      </div>
    );
  }

  return <Ctx.Provider value={config}>{children}</Ctx.Provider>;
}

/** The resolved tenant_config. Always a complete object — never null. */
export function useTenantConfig() {
  const v = useContext(Ctx);
  // Outside the provider (isolated component tests, the public pay pages)
  // fall back to the build seed rather than throwing.
  return v || resolveTenantConfig(null);
}

/** Convenience gates. */
export function useModuleEnabled(key) {
  return useTenantConfig().modules?.[key] === true;
}

export function useIsInternal() {
  return useTenantConfig().internal === true;
}

export { seedTenantConfig };
