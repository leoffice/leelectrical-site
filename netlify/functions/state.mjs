import { getStore } from "@netlify/blobs";
import { saveJobState } from "./lib/ovMerge.mjs";

// Cross-device sync for the dashboard's user edits (follow-ups, completed steps,
// notes, paid flags, paperwork). GET returns the shared state; POST merges it.
// Single shared business state — every signed-in device reads/writes the same blob.
// POST never replaces the whole ov: missing keys stay, and an older per-key
// stamp cannot overwrite a newer one. See lib/ovMerge.mjs.
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
    const result = await saveJobState(store, body, Date.now(), KEY);
    return json(result);
  }
  const cur = (await store.get(KEY, { type: "json" })) || { ov: {}, ts: 0 };
  return json(cur);
};
