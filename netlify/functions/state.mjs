import { getStore } from "./lib/storage/index.mjs";
import { rotateJsonBackup } from "./blob-backup.mjs";
import { resolveTenant } from "./lib/tenant.mjs";
import { conditionalJson, optionsResponse } from "./lib/etag.mjs";
import { deepMerge, capAuditLog } from "./lib/ovPatch.mjs";

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
      "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
  });
}

export default async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  const tenant = await resolveTenant(req);
  if (tenant == null) return json({ ok: false, error: "unauthenticated" }, 401);
  const store = getStore("jobstate", tenant);
  // Incremental save (perf Batch B, 2026-08-11): PATCH { id, patch } merges
  // one job's edits here instead of the client round-tripping the whole blob
  // (~4.5 MB each way per save). Method PATCH on purpose — an old server
  // ignores it (plain read), so a new client can never wipe state on an old
  // deployment; the client falls back to the legacy full-ov POST.
  if (req.method === "PATCH") {
    let body = {};
    try { body = await req.json(); } catch (e) {}
    if (body.id == null) return json({ ok: false, error: "id required" }, 400);
    const ts = Date.now();
    const cur = (await store.get(KEY, { type: "json" })) || { ov: {}, ts: 0 };
    const ov = cur.ov || {};
    const id = String(body.id);
    ov[id] = deepMerge(ov[id] || {}, body.patch || {});
    if (id.charAt(0) !== "_") ov[id]._savedAt = ts;
    if (ov._auditLog) ov._auditLog = capAuditLog(ov._auditLog);
    await rotateJsonBackup(store, KEY, { ov, ts });
    return json({ ok: true, ts, patched: id });
  }
  if (req.method === "POST") {
    let body = {};
    try { body = await req.json(); } catch (e) {}
    const ts = Date.now();
    const ov = body.ov || {};
    if (ov._auditLog) {
      ov._auditLog = capAuditLog(ov._auditLog);
    } else {
      // Clients never receive _auditLog anymore (GET strips it) — a legacy
      // full-ov POST echoing that view back must not erase the stored log.
      const cur = (await store.get(KEY, { type: "json" })) || { ov: {} };
      if (cur.ov && cur.ov._auditLog) ov._auditLog = cur.ov._auditLog;
    }
    await rotateJsonBackup(store, KEY, { ov, ts });
    return json({ ok: true, ts });
  }
  const cur = (await store.get(KEY, { type: "json" })) || { ov: {}, ts: 0 };
  // _auditLog is WRITE-ONLY from the app (grep-verified: no client reader) and
  // is 73% of the blob (4.19 MB of 5.75 MB, 2026-08-12) — every device was
  // re-downloading + re-parsing it on every changed poll. Serve it only when
  // explicitly asked (?audit=1, for future forensics tooling).
  const url = new URL(req.url);
  if (url.searchParams.get("audit") !== "1" && cur.ov && cur.ov._auditLog) {
    const { _auditLog, ...rest } = cur.ov;
    return conditionalJson(req, { ...cur, ov: rest }, { prefix: "sa", ts: cur.ts || 0 });
  }
  return conditionalJson(req, cur, { prefix: "s", ts: cur.ts || 0 });
};
