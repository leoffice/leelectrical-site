import { getStore } from "@netlify/blobs";

// Receives an iteration request from the LE Electric Progress tab and stores it
// so Dispatch (Claude) can read it from the /inbox endpoint. No secrets, same-origin POST.
export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { "content-type": "application/json" } });
  }
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const message = (body && body.message ? String(body.message) : "").trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "empty message" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const store = getStore("iterations");
  const ts = new Date().toISOString();
  const key = Date.now().toString() + "-" + Math.random().toString(36).slice(2, 7);
  const entry = { ts, message, source: (body && body.source) || "progress-tab" };
  if (body && body.context && typeof body.context === "object") entry.context = body.context;
  await store.setJSON(key, entry);
  return new Response(JSON.stringify({ ok: true, ts }), { headers: { "content-type": "application/json" } });
};
