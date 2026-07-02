import { getStore } from "@netlify/blobs";

// Live jobs dataset synced from QuickBooks + Google Calendar by a scheduled
// Dispatch job (overnight + midday) and on demand. The dashboard GETs this to
// render real jobs; "Sync now" POSTs op:"request" which the sync job fulfills.
// GET  -> { jobs:[...], syncedAt, request, ts }
// POST -> { op:"set", jobs:[...] }  (sync job writes the dataset)
//         { op:"request" }          (dashboard asks for a fresh pull)
const KEY = "jobsdata-v1";

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
    { jobs: [], syncedAt: 0, request: 0, ts: 0 };
}

export default async (req) => {
  const store = getStore("jobsdata");
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const doc = await load(store);
    if (b.op === "set" && Array.isArray(b.jobs)) {
      doc.jobs = b.jobs;
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
