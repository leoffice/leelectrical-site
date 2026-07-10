import { getStore } from "./lib/storage/index.mjs";

// SAS Flex "Custom Action" webhook receiver — answering-service calls/messages land here.
// Accepts JSON or form-encoded POSTs. Shared-secret: header x-le-key or ?k= must equal LE_SAS_KEY.
// GET -> { calls:[{id,receivedAt,data}], ts }  (newest first, capped 500)
const KEY = "calls-v1";
const SECRET = "le-sas-7391";

function json(o, status) {
  return new Response(JSON.stringify(o), { status: status || 200, headers: {
    "content-type": "application/json", "cache-control": "no-store",
    "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-le-key" } });
}

export default async (req) => {
  const store = getStore("calls");
  const doc = (await store.get(KEY, { type: "json", consistency: "strong" })) || { calls: [], ts: 0 };
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method === "POST") {
    const url = new URL(req.url);
    if ((req.headers.get("x-le-key") || url.searchParams.get("k")) !== SECRET) return json({ ok: false }, 401);
    let b = {};
    const ct = req.headers.get("content-type") || "";
    try { b = ct.includes("json") ? await req.json() : Object.fromEntries((await req.formData()).entries()); } catch (e) {}
    doc.calls.unshift({ id: "call" + Date.now() + Math.random().toString(36).slice(2, 5), receivedAt: new Date().toISOString(), data: b });
    doc.calls = doc.calls.slice(0, 500);
    doc.ts = Date.now();
    await store.setJSON(KEY, doc);
    return json({ ok: true });
  }
  return json(doc);
};
