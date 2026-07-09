import { getStore } from "@netlify/blobs";

// Task #6 — return channel for the floating chat bubble. Messages from the bubble
// and Dispatch's replies live here per conversation id, with per-message status.
// GET  ?convo=ID                              -> { messages:[{id,who,text,status,ts}], ts }
// POST { op:"msg",      convo, id, text }        (bubble records a sent message)
// POST { op:"reply",    convo, text }            (Dispatch posts a reply)
// POST { op:"status",   convo, id, status }      (Dispatch updates a message's status)
// POST { op:"migrate",  from, to }               (merge legacy per-device thread into shared)
// POST { op:"presence", convo, view }             (heartbeat -> "presence-v1" key)
// GET  ?presence=1                             -> { "<convo>": { lastSeen, view }, ... } (or {})
//   presence-v1 is a per-convo map. LE Pro pings with its own convo id; the
//   Dispatch chat-responder cron pings convo "dispatch-heartbeat" so the app
//   can show "Dispatch • online". Legacy single-slot { lastSeen, view, convo }
//   values are migrated into the map on read and write.
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

/** presence-v1 as a per-convo map, migrating the legacy single-slot shape. */
async function loadPresence(store) {
  const raw = (await store.get("presence-v1", { type: "json", consistency: "strong" })) || {};
  if (typeof raw.lastSeen === "number") {
    // legacy { lastSeen, view, convo } -> { [convo]: { lastSeen, view } }
    return { [raw.convo || "default"]: { lastSeen: raw.lastSeen, view: raw.view || "" } };
  }
  return raw;
}

async function load(store, convo) {
  return (await store.get(key(convo), { type: "json", consistency: "strong" })) || { messages: [], ts: 0 };
}

/** Merge messages from a legacy per-device convo into the shared thread (dedupe by id). */
async function migrate(store, from, to) {
  const src = String(from || "").trim();
  const dst = String(to || "").trim();
  if (!src || !dst || src === dst) return { merged: 0, ts: 0 };
  const [oldDoc, newDoc] = await Promise.all([load(store, src), load(store, dst)]);
  const seen = new Set((newDoc.messages || []).map((m) => m.id));
  let merged = 0;
  for (const m of oldDoc.messages || []) {
    if (!m || !m.id || seen.has(m.id)) continue;
    newDoc.messages.push(m);
    seen.add(m.id);
    merged++;
  }
  if (merged) newDoc.messages.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const now = Date.now();
  newDoc.ts = merged ? now : newDoc.ts || 0;
  if (merged) await store.setJSON(key(dst), newDoc);
  return { merged, ts: newDoc.ts };
}

export default async (req) => {
  const store = getStore("chat");
  if (req.method === "OPTIONS") return json({ ok: true });

  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const convo = b.convo || "default";
    if (b.op === "presence") {
      // Per-convo heartbeat — each pinger owns its own slot in the map.
      const map = await loadPresence(store);
      map[convo] = { lastSeen: Date.now(), view: String(b.view || "") };
      await store.setJSON("presence-v1", map);
      return json({ ok: true, ts: map[convo].lastSeen });
    }
    if (b.op === "migrate") {
      const r = await migrate(store, b.from, b.to);
      return json({ ok: true, ...r });
    }
    const doc = await load(store, convo);
    const now = Date.now();
    if (b.op === "msg" && b.text) {
      doc.messages.push({ id: b.id || "m" + now, who: "you", text: String(b.text), status: "Sent", ts: now });
    } else if (b.op === "reply" && b.text) {
      const who = String(b.who || "israel");
      doc.messages.push({ id: "r" + now, who, text: String(b.text), status: "", ts: now });
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
  if (url.searchParams.get("presence")) {
    return json(await loadPresence(store));
  }
  const convo = url.searchParams.get("convo") || "default";
  return json(await load(store, convo));
};
