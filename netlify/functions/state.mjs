import { getStore } from "./lib/storage/index.mjs";
import { rotateJsonBackup } from "./blob-backup.mjs";
import { resolveTenant } from "./lib/tenant.mjs";
import { conditionalJson, optionsResponse } from "./lib/etag.mjs";
import { capAuditLog } from "./lib/ovPatch.mjs";
import { mergeIncomingOv, stateWriteBody } from "./lib/ovMerge.mjs";

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
  // PATCH { id, patch } and POST { ov } both per-key merge into the live
  // overlay. A key the payload omits is never deleted. Deletes are tombstones
  // (_deleted or op:"delete"). An older _savedAt/_version is skipped.
  // An empty or partial body is a no-op for every key it does not name.
  // POST used to replace the whole blob — a stale full-ov client wiped jobs.
  // KV is eventually consistent: two near-simultaneous saves can still lose
  // one write, the same race that existed before this change.
  if (req.method === "PATCH" || req.method === "POST") {
    let raw = {};
    try { raw = await req.json(); } catch (e) {}
    const body = stateWriteBody(req.method, raw);
    if (body && body.error) return json({ ok: false, error: body.error }, 400);
    const patchedId = req.method === "PATCH" ? String(raw.id) : "";
    const ts = Date.now();
    const cur = (await store.get(KEY, { type: "json", consistency: "strong" })) || { ov: {}, ts: 0 };
    const merged = mergeIncomingOv(cur.ov || {}, body, ts);
    if (merged.ov && merged.ov._auditLog) {
      const capped = capAuditLog(merged.ov._auditLog);
      if (capped !== merged.ov._auditLog) {
        merged.ov._auditLog = capped;
        merged.changed = true;
      }
    }
    if (!merged.changed) {
      const idle = { ok: true, ts: cur.ts || 0, skipped: merged.skipped, unchanged: true, stamps: {} };
      if (patchedId) idle.patched = patchedId;
      return json(idle);
    }
    await rotateJsonBackup(store, KEY, { ov: merged.ov, ts });
    const out = { ok: true, ts, skipped: merged.skipped, stamps: merged.stamps };
    if (patchedId) out.patched = patchedId;
    return json(out);
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
