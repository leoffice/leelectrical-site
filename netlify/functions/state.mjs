import { getStore } from "./lib/storage/index.mjs";
import { rotateJsonBackup } from "./blob-backup.mjs";
import { conditionalJson } from "./lib/etag.mjs";

// Cross-device sync for the dashboard's user edits (follow-ups, completed steps,
// notes, paid flags, paperwork). GET returns the shared state; POST saves it.
// Single shared business state — every signed-in device reads/writes the same blob.
const KEY = "ov-v1";

function json(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export default async (req) => {
  const store = getStore("jobstate");
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method === "POST") {
    let body = {};
    try { body = await req.json(); } catch (e) {}
    const ov = body.ov || {};
    const ts = Date.now();
    await rotateJsonBackup(store, KEY, { ov, ts });
    return json({ ok: true, ts });
  }
  const cur = (await store.get(KEY, { type: "json" })) || { ov: {}, ts: 0 };
  // GET: ETag off `ts` (bumped on every overlay write) → unchanged polls 304.
  return conditionalJson(req, cur, { prefix: "s", ts: cur.ts });
};
