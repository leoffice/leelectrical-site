/**
 * Strongly-consistent access-state store.
 * Prefer Cloudflare Durable Object (read-your-writes). KV is never used
 * as the authority (that caused the flip-flop bug).
 *
 * Binding name: AGENT_ACCESS (Durable Object namespace).
 * Fallback: AGENT_ACCESS_SVC service binding → le-agent-access-do HTTP /state
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
 * @returns {{ mode: 'do'|'svc'|'memory', appId: string, get: () => Promise<object>, put: (doc: object) => Promise<object> }}
 */
export function getAccessStateStore(env = {}, appId = APP_ID) {
  const id = appId || APP_ID;
  const ns = env?.AGENT_ACCESS;

  // Path 1: direct Durable Object binding (same-script or script_name)
  if (ns && typeof ns.idFromName === "function" && typeof ns.get === "function") {
    const stub = ns.get(ns.idFromName(`app:${id}`));
    return {
      mode: "do",
      appId: id,
      async get() {
        try {
          const res = await stub.fetch("https://agent-access.do/state", { method: "GET" });
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            // Cross-script Pages→Worker DO can 503 "Worker not found" — fall through to service
            if (String(t).includes("Worker not found") || res.status === 503) {
              throw Object.assign(new Error(`AgentAccess DO get failed: ${res.status} ${t}`), {
                code: "do_worker_not_found",
              });
            }
            throw new Error(`AgentAccess DO get failed: ${res.status} ${t}`);
          }
          const doc = (await res.json()) || emptyDoc();
          return refreshAccessState(doc);
        } catch (e) {
          // Try service binding before failing hard
          const svcStore = serviceStore(env, id);
          if (svcStore) return svcStore.get();
          throw e;
        }
      },
      async put(doc) {
        const fresh = refreshAccessState(doc);
        try {
          const res = await stub.fetch("https://agent-access.do/state", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ doc: fresh }),
          });
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            if (String(t).includes("Worker not found") || res.status === 503) {
              throw Object.assign(new Error(`AgentAccess DO put failed: ${res.status} ${t}`), {
                code: "do_worker_not_found",
              });
            }
            throw new Error(`AgentAccess DO put failed: ${res.status} ${t}`);
          }
          return (await res.json()) || fresh;
        } catch (e) {
          const svcStore = serviceStore(env, id);
          if (svcStore) return svcStore.put(doc);
          throw e;
        }
      },
    };
  }

  // Path 2: service binding to le-agent-access-do worker (HTTP → DO)
  const svcOnly = serviceStore(env, id);
  if (svcOnly) return svcOnly;

  // Memory fallback — tests only. Production Pages must bind AGENT_ACCESS DO or service.
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

/**
 * Service-binding store: Pages → le-agent-access-do → Durable Object.
 * env.AGENT_ACCESS_SVC is a Fetcher from [[services]] binding.
 */
function serviceStore(env, appId) {
  const svc = env?.AGENT_ACCESS_SVC;
  if (!svc || typeof svc.fetch !== "function") return null;
  const base = `https://agent-access-svc/state?app=${encodeURIComponent(appId)}`;
  return {
    mode: "svc",
    appId,
    async get() {
      const res = await svc.fetch(base, {
        method: "GET",
        headers: { "x-le-app-id": appId },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`AgentAccess SVC get failed: ${res.status} ${t}`);
      }
      const doc = (await res.json()) || emptyDoc();
      return refreshAccessState(doc);
    },
    async put(doc) {
      const fresh = refreshAccessState(doc);
      const res = await svc.fetch(base, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-le-app-id": appId },
        body: JSON.stringify({ doc: fresh }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`AgentAccess SVC put failed: ${res.status} ${t}`);
      }
      return (await res.json()) || fresh;
    },
  };
}

/** Test helper — wipe in-memory docs between cases. */
export function __resetAccessStateMemory() {
  memoryDocs.clear();
}
