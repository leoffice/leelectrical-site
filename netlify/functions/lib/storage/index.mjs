import { createNetlifyStore } from "./netlify.mjs";
import { createKvJsonStore, createR2BinaryStore } from "./cloudflare.mjs";

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
 * @param {string} name Store name (jobsdata, docs, commands, …)
 * @returns {import("./types.mjs").BlobStore}
 */
export function getStore(name) {
  if (resolveStorageBackend() === "cloudflare") {
    const env = runtimeEnv || {};
    if (R2_STORES.has(name)) return createR2BinaryStore(name, env);
    return createKvJsonStore(name, env);
  }
  return createNetlifyStore(name);
}

export { rotateJsonBackup } from "./backup.mjs";