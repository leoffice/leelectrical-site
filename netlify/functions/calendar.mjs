import { getStore } from "./lib/storage/index.mjs";

// Calendar events feed for task #16 (New Job "Choose from calendar" + two-way
// job<->calendar linking). A host/agent sync writes upcoming Google Calendar
// events here; the dashboard GETs them to prefill a new job. Writing a job's
// schedule back to the calendar happens via the command bus (calendar_upsert),
// not this function.
// GET  -> { events:[{id,summary,start,end,location,description}], syncedAt, request, ts }
// POST -> { op:"set", events:[...] }   (sync writes the dataset)
//         { op:"request" }             (dashboard asks for a fresh pull)
const KEY = "calendar-v1";

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

async function load(store) {
  return (await store.get(KEY, { type: "json", consistency: "strong" })) ||
    { events: [], syncedAt: 0, request: 0, ts: 0 };
}

export default async (req) => {
  const store = getStore("calendar");
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const doc = await load(store);
    if (b.op === "set" && Array.isArray(b.events)) {
      doc.events = b.events;
      doc.syncedAt = Date.now();
      doc.request = 0;
    } else if (b.op === "request") {
      doc.request = Date.now();
    }
    doc.ts = Date.now();
    await store.setJSON(KEY, doc);
    return json(doc);
  }
  return json(await load(store));
};
