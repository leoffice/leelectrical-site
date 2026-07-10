import { describe, it, expect, beforeEach } from "vitest";
import { resolveStorageBackend, bindStorageEnv } from "../../netlify/functions/lib/storage/index.mjs";
import { createKvJsonStore } from "../../netlify/functions/lib/storage/cloudflare.mjs";

describe("storage adapter", () => {
  beforeEach(() => {
    bindStorageEnv(null);
    delete process.env.STORAGE_BACKEND;
  });

  it("defaults to netlify backend", () => {
    expect(resolveStorageBackend()).toBe("netlify");
  });

  it("cloudflare KV store supports json get/set/list", async () => {
    /** @type {Map<string, { value: string, metadata: Record<string, string> }>} */
    const mem = new Map();
    const kv = {
      async get(key, type) {
        const rec = mem.get(key);
        if (!rec) return null;
        if (type === "json") return JSON.parse(rec.value);
        return rec.value;
      },
      async put(key, value, opts = {}) {
        mem.set(key, { value: String(value), metadata: opts.metadata || {} });
      },
      async getWithMetadata(key, type) {
        const rec = mem.get(key);
        if (!rec) return null;
        return {
          value: type === "json" ? JSON.parse(rec.value) : rec.value,
          metadata: rec.metadata,
        };
      },
      async delete(key) {
        mem.delete(key);
      },
      async list({ prefix }) {
        return { keys: [...mem.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) };
      },
    };

    const store = createKvJsonStore("devtasks", { LE_KV: kv });
    await store.setJSON("devtasks-v1", { tasks: [{ num: 1 }], seq: 1 });
    const doc = await store.get("devtasks-v1", { type: "json" });
    expect(doc.tasks).toHaveLength(1);
    const listed = await store.list();
    expect(listed.blobs.map((b) => b.key)).toContain("devtasks-v1");
  });

  it("requires LE_KV for cloudflare KV store", () => {
    expect(() => createKvJsonStore("jobsdata", {})).toThrow(/LE_KV/);
  });

  it("switches backend flag to cloudflare", () => {
    process.env.STORAGE_BACKEND = "cloudflare";
    expect(resolveStorageBackend()).toBe("cloudflare");
  });
});