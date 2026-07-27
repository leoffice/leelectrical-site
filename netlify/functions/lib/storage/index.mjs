import { createNetlifyStore } from "./netlify.mjs";
import { createKvJsonStore, createR2BinaryStore } from "./cloudflare.mjs";
import { DEFAULT_TENANT, isValidTenantId } from "../tenant.mjs";

/** Binary/large-file stores → R2 on Cloudflare. Everything else → KV. */
const R2_STORES = new Set(["docs"]);

/** @type {Record<string, unknown>|null} */
let runtimeEnv = null;

/** Bind Cloudflare Worker env (KV/R2 namespaces). Called from worker entry at cutover. */
export function bindStorageEnv(env) {
  runtimeEnv = env;
}

export function resolveStorageBackend() {
  const raw = runtimeEnv?.STORAGE_BACKEND ?? process.env.STORAGE_BACKEND ?? "netlify";
  return String(raw).toLowerCase() === "cloudflare" ? "cloudflare" : "netlify";
}

/**
 * Per-tenant key prefix. The flagship tenant (`le`, the incumbent) keeps the
 * LEGACY namespace byte-for-byte so its existing data needs no migration; every
 * other tenant's keys live under `t/<tenant>/`, giving hard isolation on the
 * shared KV/R2 backend. Called with an already-validated tenant id.
 */
function tenantPrefix(tenantId) {
  if (!tenantId || tenantId === DEFAULT_TENANT) return "";
  return `t/${tenantId}/`;
}

/**
 * Wrap a backend store so every key is transparently namespaced by tenant.
 * Backend-agnostic (KV, R2, Netlify Blobs) — the tenant segment is prepended to
 * the key the caller passes, and stripped back out of list() results. When the
 * prefix is empty (LE / no tenant) the store is returned unwrapped.
 */
function tenantScopedStore(store, prefix) {
  if (!prefix) return store;
  const k = (key) => prefix + key;
  return {
    get: (key, opts) => store.get(k(key), opts),
    setJSON: (key, obj) => store.setJSON(k(key), obj),
    set: (key, data, opts) => store.set(k(key), data, opts),
    getWithMetadata: (key, opts) => store.getWithMetadata(k(key), opts),
    delete: (key) => store.delete(k(key)),
    async list(opts) {
      const listed = await store.list(opts);
      const blobs = (listed?.blobs || [])
        .filter((b) => typeof b.key === "string" && b.key.startsWith(prefix))
        .map((b) => ({ ...b, key: b.key.slice(prefix.length) }));
      return { ...listed, blobs };
    },
  };
}

/**
 * @param {string} name Store name (jobsdata, docs, commands, …)
 * @param {string} [tenantId] Signed-in user's tenant (from resolveTenant). When
 *   omitted, resolves to the incumbent tenant (LEGACY namespace) — identical to
 *   the pre-isolation behavior, so untouched callers keep working.
 * @returns {import("./types.mjs").BlobStore}
 */
export function getStore(name, tenantId = DEFAULT_TENANT) {
  const tenant = isValidTenantId(tenantId) ? tenantId : DEFAULT_TENANT;
  const backend =
    resolveStorageBackend() === "cloudflare"
      ? R2_STORES.has(name)
        ? createR2BinaryStore(name, runtimeEnv || {})
        : createKvJsonStore(name, runtimeEnv || {})
      : createNetlifyStore(name);
  return tenantScopedStore(backend, tenantPrefix(tenant));
}

export { rotateJsonBackup } from "./backup.mjs";
