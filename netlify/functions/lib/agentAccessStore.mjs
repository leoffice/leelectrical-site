/**
 * Strongly-consistent access-state store.
 * Prefer Cloudflare Durable Object (read-your-writes). KV is never used
 * as the authority (that caused the flip-flop bug).
 *
 * Binding name: AGENT_ACCESS (Durable Object namespace).
 * Object id: idFromName(`app:${appId}`) — one record per app.
 */
import { APP_ID, emptyDoc, refreshAccessState } from "./agentAccess.mjs";

/** In-process fallback for unit tests / local without DO binding. */
const memoryDocs = new Map();

function memoryKey(appId) {
  return `app:${appId || APP_ID}`;
}

/**
 * @param {unknown} env
 * @param {string} [appId]
 * @returns {{ mode: 'do'|'memory', appId: string, get: () => Promise<object>, put: (doc: object) => Promise<object> }}
 */
export function getAccessStateStore(env = {}, appId = APP_ID) {
  const id = appId || APP_ID;
  const ns = env?.AGENT_ACCESS;

  if (ns && typeof ns.idFromName === "function" && typeof ns.get === "function") {
    const stub = ns.get(ns.idFromName(`app:${id}`));
    return {
      mode: "do",
      appId: id,
      async get() {
        const res = await stub.fetch("https://agent-access.do/state", { method: "GET" });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`AgentAccess DO get failed: ${res.status} ${t}`);
        }
        const doc = (await res.json()) || emptyDoc();
        return refreshAccessState(doc);
      },
      async put(doc) {
        const fresh = refreshAccessState(doc);
        // Set DO alarm for auto-off when in 24h mode
        const res = await stub.fetch("https://agent-access.do/state", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ doc: fresh }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`AgentAccess DO put failed: ${res.status} ${t}`);
        }
        return (await res.json()) || fresh;
      },
    };
  }

  // Memory fallback — tests only. Production Pages must bind AGENT_ACCESS DO.
  return {
    mode: "memory",
    appId: id,
    async get() {
      const cur = memoryDocs.get(memoryKey(id)) || emptyDoc();
      return refreshAccessState(cur);
    },
    async put(doc) {
      const fresh = refreshAccessState(doc);
      memoryDocs.set(memoryKey(id), fresh);
      return fresh;
    },
  };
}

/** Test helper — wipe in-memory docs between cases. */
export function __resetAccessStateMemory() {
  memoryDocs.clear();
}
