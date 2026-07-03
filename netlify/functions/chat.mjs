import { getStore } from "@netlify/blobs";

// Task #6 — return channel for the floating chat bubble. Messages from the bubble
// and Dispatch's replies live here per conversation id, with per-message status.
// GET  ?convo=ID                              -> { messages:[{id,who,text,status,ts}], ts }
// POST { op:"msg",    convo, id, text }        (bubble records a sent message)
// POST { op:"reply",  convo, text }            (Dispatch posts a reply)
// POST { op:"status", convo, id, status }      (Dispatch updates a message's status)
// Statuses used by the UI: Sent -> Received -> Read -> Working on it (then a reply).

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

const key = (convo) => "chat-" + String(convo || "default").replace(/[^a-zA-Z0-9_-]/g, "");

async function load(store, convo) {
  return (await store.get(key(convo), { type: "json", consistency: "strong" })) || { messages: [], ts: 0 };
}

export default async (req) => {
  const store = getStore("chat");
  if (req.method === "OPTIONS") return json({ ok: true });

  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const convo = b.convo || "default";
    const doc = await load(store, convo);
    const now = Date.now();
    if (b.op === "msg" && b.text) {
      doc.messages.push({ id: b.id || "m" + now, who: "you", text: String(b.text), status: "Sent", ts: now });
    } else if (b.op === "reply" && b.text) {
      doc.messages.push({ id: "r" + now, who: "claude", text: String(b.text), status: "", ts: now });
    } else if (b.op === "status" && b.id) {
      const m = doc.messages.find((x) => x.id === b.id);
      if (m) m.status = b.status || m.status;
    } else {
      return json({ ok: false, error: "bad op" });
    }
    doc.ts = now;
    await store.setJSON(key(convo), doc);
    return json({ ok: true, ts: now });
  }

  const url = new URL(req.url);
  const convo = url.searchParams.get("convo") || "default";
  return json(await load(store, convo));
};
