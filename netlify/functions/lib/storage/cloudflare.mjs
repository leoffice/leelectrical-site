/** @param {string} storeName @param {Record<string, unknown>} env */

function kvBinding(env) {
  const kv = env.LE_KV;
  if (!kv || typeof kv.get !== "function") {
    throw new Error("Cloudflare KV binding LE_KV is required (STORAGE_BACKEND=cloudflare)");
  }
  return kv;
}

function r2Binding(env) {
  const r2 = env.LE_R2;
  if (!r2 || typeof r2.get !== "function") {
    throw new Error("Cloudflare R2 binding LE_R2 is required for binary stores");
  }
  return r2;
}

function prefixed(storeName, key) {
  return `${storeName}/${key}`;
}

function metaToStrings(meta) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) out[k] = String(v);
  return out;
}

function metaFromStrings(meta) {
  /** @type {Record<string, string|number|boolean>} */
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (k === "ts" || k === "bytes") out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

/**
 * @param {string} storeName
 * @param {Record<string, unknown>} env
 * @returns {import("./types.mjs").BlobStore}
 */
export function createKvJsonStore(storeName, env) {
  const kv = kvBinding(env);
  const prefix = `${storeName}/`;

  return {
    async get(key, opts = {}) {
      const type = opts.type || "text";
      const raw = await kv.get(prefix + key, type === "json" ? "json" : "text");
      if (raw == null) return null;
      if (type === "json") {
        return typeof raw === "object" ? raw : JSON.parse(String(raw));
      }
      if (type === "text") return String(raw);
      if (type === "arrayBuffer") {
        const s = typeof raw === "string" ? raw : JSON.stringify(raw);
        return new TextEncoder().encode(s).buffer;
      }
      return raw;
    },

    async setJSON(key, obj) {
      await kv.put(prefix + key, JSON.stringify(obj));
    },

    async set(key, data, opts = {}) {
      const body = typeof data === "string" ? data : JSON.stringify(data);
      await kv.put(prefix + key, body, { metadata: metaToStrings(opts.metadata || {}) });
    },

    async getWithMetadata(key, opts = {}) {
      const type = opts.type || "text";
      const rec = await kv.getWithMetadata(prefix + key, type === "json" ? "json" : "text");
      if (!rec || rec.value == null) return null;
      let data = rec.value;
      if (type === "arrayBuffer") {
        const s = typeof data === "string" ? data : JSON.stringify(data);
        data = new TextEncoder().encode(s).buffer;
      } else if (type === "blob" && typeof data === "string") {
        data = new Blob([data]);
      }
      return { data, metadata: metaFromStrings(rec.metadata) };
    },

    async delete(key) {
      await kv.delete(prefix + key);
    },

    async list() {
      const listed = await kv.list({ prefix });
      return { blobs: (listed.keys || []).map((k) => ({ key: k.name.slice(prefix.length) })) };
    },
  };
}

/**
 * @param {string} storeName
 * @param {Record<string, unknown>} env
 * @returns {import("./types.mjs").BlobStore}
 */
export function createR2BinaryStore(storeName, env) {
  const bucket = r2Binding(env);
  const prefix = `${storeName}/`;

  return {
    async get(key, opts = {}) {
      const obj = await bucket.get(prefix + key);
      if (!obj) return null;
      const type = opts.type || "arrayBuffer";
      if (type === "json") return obj.json();
      if (type === "text") return obj.text();
      if (type === "blob") return obj.blob();
      return obj.arrayBuffer();
    },

    async setJSON(key, obj) {
      await bucket.put(prefix + key, JSON.stringify(obj), {
        httpMetadata: { contentType: "application/json" },
      });
    },

    async set(key, data, opts = {}) {
      const meta = opts.metadata || {};
      await bucket.put(prefix + key, data, {
        customMetadata: metaToStrings(meta),
        httpMetadata: { contentType: String(meta.mime || "application/octet-stream") },
      });
    },

    async getWithMetadata(key, opts = {}) {
      const obj = await bucket.get(prefix + key);
      if (!obj) return null;
      const type = opts.type || "arrayBuffer";
      let data;
      if (type === "json") data = await obj.json();
      else if (type === "text") data = await obj.text();
      else if (type === "blob") data = await obj.blob();
      else data = await obj.arrayBuffer();
      return { data, metadata: metaFromStrings(obj.customMetadata) };
    },

    async delete(key) {
      await bucket.delete(prefix + key);
    },

    async list() {
      const listed = await bucket.list({ prefix });
      return { blobs: (listed.objects || []).map((o) => ({ key: o.key.slice(prefix.length) })) };
    },
  };
}