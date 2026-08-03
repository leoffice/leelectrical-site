import { getStore } from "./lib/storage/index.mjs";
import { rotateJsonBackup } from "./blob-backup.mjs";
import { resolveTenant } from "./lib/tenant.mjs";
import { conditionalJson, optionsResponse } from "./lib/etag.mjs";

// Cross-device sync for the dashboard's user edits (follow-ups, completed steps,
// notes, paid flags, paperwork). GET returns the state; POST saves it.
// Per-tenant: the store is namespaced by the signed-in user's tenant_id
// (resolveTenant), so every tenant reads/writes its OWN isolated overlay. LE
// (the incumbent tenant) keeps the legacy "ov-v1" namespace unchanged.
const KEY = "ov-v1";

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
  });
}

export default async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  const tenant = await resolveTenant(req);
  if (tenant == null) return json({ ok: false, error: "unauthenticated" }, 401);
  const store = getStore("jobstate", tenant);
  if (req.method === "POST") {
    let body = {};
    try { body = await req.json(); } catch (e) {}
    const ov = body.ov || {};
    const ts = Date.now();
    await rotateJsonBackup(store, KEY, { ov, ts });
    return json({ ok: true, ts });
  }
  const cur = (await store.get(KEY, { type: "json" })) || { ov: {}, ts: 0 };
  return conditionalJson(req, cur, { prefix: "s", ts: cur.ts || 0 });
};
